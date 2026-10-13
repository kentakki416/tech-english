import { resolve } from "node:path"

import { PollyClient } from "@aws-sdk/client-polly"

import { createDrizzleClient } from "@repo/db"
import { logger } from "@repo/logger"
import { createStorage, type Storage } from "@repo/storage"

import { FakeTtsClient, isPollyVoiceId, PollyTtsClient, type TtsClient } from "../client/polly"
import { AUDIO_CACHE_CONTROL, POLLY_MAX_ATTEMPTS } from "../const/audio"
import { env } from "../env"
import { isAudioStorageAllowed } from "../lib/audio"
import { DrizzlePassageAudioRepository } from "../repository/drizzle"
import { setupGracefulShutdown } from "../runtime/graceful-shutdown"
import * as service from "../service"

/**
 * TTS_PROVIDER の音声合成のクライアントを作る。polly で AWS の資格情報を解決できなければ、production では throw、
 * それ以外は null を返す（ローカルに資格情報が無くてもタスクを失敗にしない）
 */
const createTtsClient = async (): Promise<TtsClient | null> => {
  if (env.TTS_PROVIDER === "fake") return new FakeTtsClient()
  if (!isPollyVoiceId(env.TTS_VOICE_ID)) {
    throw new Error(`TTS_VOICE_ID is not a Polly voice: ${env.TTS_VOICE_ID}`)
  }
  const polly = new PollyClient({ maxAttempts: POLLY_MAX_ATTEMPTS, region: env.AWS_REGION })
  try {
    await polly.config.credentials()
  } catch (error) {
    polly.destroy()
    if (env.NODE_ENV === "production") throw error
    logger.warn(
      "AWS credentials are not available, so generate-audio does nothing (unset TTS_PROVIDER or set it to fake to generate silent audio locally)",
      { error: error instanceof Error ? error.message : String(error) },
    )
    return null
  }
  return new PollyTtsClient(polly)
}

/**
 * 音声の保存先。s3 は長期キャッシュ（キーに本文と voice のハッシュを含む）、local はリポジトリ直下の .storage/audio/（api が開発環境でだけ /media で配信する）
 */
const createAudioStorage = (): Storage => {
  if (env.AUDIO_STORAGE_TYPE === "s3" && env.AUDIO_STORAGE_S3_BUCKET) {
    const bucket = env.AUDIO_STORAGE_S3_BUCKET
    return createStorage({
      bucket,
      cacheControl: AUDIO_CACHE_CONTROL,
      publicUrlBase: `s3://${bucket}`,
      region: env.AWS_REGION,
      type: "s3",
    })
  }
  return createStorage({ baseDir: resolve(env.AUDIO_STORAGE_LOCAL_DIR), publicUrlPrefix: "/media", type: "local" })
}

/**
 * generate:audio
 *
 * 公開済みの問題の読み上げの音声（mp3 と単語の時刻）を作る。本番は EventBridge Scheduler → ECS RunTask で 1 時間ごとに
 * `node dist/task/generate-audio.js` を起動する想定（generate:questions とは独立）。
 *
 *   pnpm generate:audio                      # production は Polly、それ以外は無音の mp3 と等間隔の単語の時刻（TTS_PROVIDER の既定）
 *   TTS_PROVIDER=polly pnpm generate:audio   # ローカルで Polly を呼ぶ（手元の AWS の資格情報で課金される。無ければ warn を出して何もしない）
 *
 * task 自身は env を読んで DB client / Repository / 音声合成のクライアント / 保存先を組み立てて service に DI するだけ。
 * 1 件でも失敗（failed・次の実行に回した失敗）があれば最後に throw して exit code 1 で終え、スケジューラに通知する。
 * production で AUDIO_STORAGE_TYPE が local なら、何もせずに起動時に throw する（env のスキーマでは検査しない。cron の他のタスクを止めないため）
 */
const main = async (): Promise<void> => {
  if (!isAudioStorageAllowed({ nodeEnv: env.NODE_ENV, storageType: env.AUDIO_STORAGE_TYPE })) {
    throw new Error(
      "AUDIO_STORAGE_TYPE=local cannot be used in production: the mp3 files would be written to the container's ephemeral storage " +
        "while passage_audios becomes ready. Set AUDIO_STORAGE_TYPE=s3 and AUDIO_STORAGE_S3_BUCKET",
    )
  }
  const ttsClient = await createTtsClient()
  if (!ttsClient) return

  const db = createDrizzleClient({
    onError: (error) => {
      logger.error("db idle client error", error)
    },
    url: env.DATABASE_URL,
  })
  const { isShuttingDown } = setupGracefulShutdown(db)

  logger.info("generate-audio started", {
    maxPassagesPerRun: env.AUDIO_MAX_PASSAGES_PER_RUN,
    storageType: env.AUDIO_STORAGE_TYPE,
    ttsProvider: env.TTS_PROVIDER,
    voiceId: env.TTS_VOICE_ID,
  })

  try {
    const result = await service.audio.generateAudio(
      {
        isShuttingDown,
        maxPassagesPerRun: env.AUDIO_MAX_PASSAGES_PER_RUN,
        now: () => new Date(),
        voiceId: env.TTS_VOICE_ID,
      },
      { passageAudioRepository: new DrizzlePassageAudioRepository(db) },
      { audioStorage: createAudioStorage(), ttsClient },
    )
    logger.info("generate-audio completed", result)
    /**
     * 失敗した問題があれば exit 1 でスケジューラに通知する（他の件は処理済み。生成中に本文が変わった・確保を取り直されたものは失敗に数えない）
     */
    const failureCount = result.failedCount + result.retryLaterCount
    if (failureCount > 0) {
      throw new Error(
        `generate-audio: ${failureCount} passage(s) failed (${result.failedCount} reached the attempt limit and were marked as failed)`,
      )
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  logger.error(
    "generate-audio failed",
    err instanceof Error ? err : new Error(String(err)),
  )
  process.exit(1)
})
