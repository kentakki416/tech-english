import { resolve } from "node:path"

import { PollyClient } from "@aws-sdk/client-polly"

import { logger } from "@repo/logger"
import { createStorage, type Storage } from "@repo/storage"

import { FakeTtsClient, isPollyVoiceId, PollyTtsClient, type TtsClient } from "../client/polly"
import { AUDIO_CACHE_CONTROL, POLLY_MAX_ATTEMPTS } from "../const/audio"
import { env } from "../env"
import { isAudioStorageAllowed } from "../lib/audio"

/**
 * TTS_PROVIDER の音声合成のクライアントを作る（generate:audio・generate:word-audio で共有）。polly で AWS の資格情報を解決できなければ、
 * production では throw、それ以外は null を返す（ローカルに資格情報が無くてもタスクを失敗にしない）
 */
export const createTtsClient = async (taskName: string): Promise<TtsClient | null> => {
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
      `AWS credentials are not available, so ${taskName} does nothing (unset TTS_PROVIDER or set it to fake to generate silent audio locally)`,
      { error: error instanceof Error ? error.message : String(error) },
    )
    return null
  }
  return new PollyTtsClient(polly)
}

/**
 * production で保存先が local なら throw する（コンテナの一時領域に mp3 を書いて ready にしないため。env のスキーマでは検査しない。
 * cron の他のタスクを止めないため）
 */
export const assertAudioStorageAllowed = (taskName: string): void => {
  if (isAudioStorageAllowed({ nodeEnv: env.NODE_ENV, storageType: env.AUDIO_STORAGE_TYPE })) return
  throw new Error(
    `AUDIO_STORAGE_TYPE=local cannot be used in production (${taskName}): the mp3 files would be written to the container's ephemeral storage ` +
      "while the audio rows become ready. Set AUDIO_STORAGE_TYPE=s3 and AUDIO_STORAGE_S3_BUCKET",
  )
}

/**
 * 音声の保存先（読み上げと単語の発音で共有）。s3 は長期キャッシュ（キーに本文・見出し語と voice のハッシュを含む）、
 * local はリポジトリ直下の .storage/audio/（api が開発環境でだけ /media で配信する）
 */
export const createAudioStorage = (): Storage => {
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
