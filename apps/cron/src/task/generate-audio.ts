import { createDrizzleClient } from "@repo/db"
import { logger } from "@repo/logger"

import { env } from "../env"
import { buildAudioVoiceId } from "../lib/audio"
import { DrizzleAudioSynthesisUsageRepository, DrizzlePassageAudioRepository } from "../repository/drizzle"
import { assertAudioStorageAllowed, createAudioStorage, createTtsClient } from "../runtime/audio-clients"
import { setupGracefulShutdown } from "../runtime/graceful-shutdown"
import * as service from "../service"

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
 * 1 件でも失敗（失敗の上限に達した・次の実行に回した失敗）があるか、月の上限（AUDIO_MONTHLY_CHARACTER_LIMIT）で止めたら、
 * 最後に throw して exit code 1 で終え、スケジューラに通知する。
 * production で AUDIO_STORAGE_TYPE が local なら、何もせずに起動時に throw する（env のスキーマでは検査しない。cron の他のタスクを止めないため）
 */
const main = async (): Promise<void> => {
  assertAudioStorageAllowed("generate-audio")
  const ttsClient = await createTtsClient("generate-audio")
  if (!ttsClient) return

  const db = createDrizzleClient({
    onError: (error) => {
      logger.error("db idle client error", error)
    },
    url: env.DATABASE_URL,
  })
  const { isShuttingDown } = setupGracefulShutdown(db)
  /**
   * fake は fake:<voice> にする（polly に切り替えたときに、fake で作った無音の音声を voice が違う行として作り直すため）
   */
  const voiceId = buildAudioVoiceId({ provider: env.TTS_PROVIDER, voiceId: env.TTS_VOICE_ID })

  logger.info("generate-audio started", {
    maxPassagesPerRun: env.AUDIO_MAX_PASSAGES_PER_RUN,
    monthlyCharacterLimit: env.AUDIO_MONTHLY_CHARACTER_LIMIT,
    storageType: env.AUDIO_STORAGE_TYPE,
    ttsProvider: env.TTS_PROVIDER,
    voiceId,
  })

  try {
    const result = await service.audio.generateAudio(
      {
        isShuttingDown,
        maxPassagesPerRun: env.AUDIO_MAX_PASSAGES_PER_RUN,
        monthlyCharacterLimit: env.AUDIO_MONTHLY_CHARACTER_LIMIT,
        now: () => new Date(),
        voiceId,
      },
      {
        audioSynthesisUsageRepository: new DrizzleAudioSynthesisUsageRepository(db),
        passageAudioRepository: new DrizzlePassageAudioRepository(db),
      },
      { audioStorage: createAudioStorage(), ttsClient },
    )
    logger.info("generate-audio completed", result)
    /**
     * 月の上限で止めたら exit 1 でスケジューラに通知する（確保は外してあるので、上限を上げるか翌月になれば次の実行から続きを作る）
     */
    if (result.isMonthlyLimitReached) {
      throw new Error(`generate-audio: stopped at the monthly Polly character limit (AUDIO_MONTHLY_CHARACTER_LIMIT=${env.AUDIO_MONTHLY_CHARACTER_LIMIT})`)
    }
    /**
     * 失敗した問題があれば exit 1 でスケジューラに通知する（他の件は処理済み。生成中に本文が変わった・確保を取り直されたものは失敗に数えない）
     */
    const failureCount = result.failedCount + result.retryLaterCount
    if (failureCount > 0) {
      throw new Error(
        `generate-audio: ${failureCount} passage(s) failed (${result.failedCount} reached the attempt limit)`,
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
