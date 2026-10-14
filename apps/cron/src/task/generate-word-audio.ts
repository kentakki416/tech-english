import { createDrizzleClient } from "@repo/db"
import { logger } from "@repo/logger"

import { env } from "../env"
import { buildAudioVoiceId } from "../lib/audio"
import { DrizzleAudioSynthesisUsageRepository, DrizzleWordAudioRepository } from "../repository/drizzle"
import { assertAudioStorageAllowed, createAudioStorage, createTtsClient } from "../runtime/audio-clients"
import { setupGracefulShutdown } from "../runtime/graceful-shutdown"
import * as service from "../service"

/**
 * generate:word-audio
 *
 * 単語帳に出うる見出し語の発音の音声（mp3）を作る（vocabulary-pronunciation README「単語の音声の生成タスク」）。本番は EventBridge Scheduler →
 * ECS RunTask で 1 時間ごとに `node dist/task/generate-word-audio.js` を起動する想定（generate:audio とは独立。片方の失敗で片方を止めない）。
 *
 *   pnpm generate:word-audio                      # production は Polly、それ以外は無音の mp3（TTS_PROVIDER の既定）
 *   TTS_PROVIDER=polly pnpm generate:word-audio   # ローカルで Polly を呼ぶ（手元の AWS の資格情報で課金される。無ければ warn を出して何もしない）
 *
 * 音声合成・保存先・月の上限（AUDIO_MONTHLY_CHARACTER_LIMIT。読み上げと合算）は generate:audio と共有する。
 * 1 語でも失敗があるか、月の上限で止めたら、最後に throw して exit code 1 で終え、スケジューラに通知する
 */
const main = async (): Promise<void> => {
  assertAudioStorageAllowed("generate-word-audio")
  const ttsClient = await createTtsClient("generate-word-audio")
  if (!ttsClient) return

  const db = createDrizzleClient({
    onError: (error) => {
      logger.error("db idle client error", error)
    },
    url: env.DATABASE_URL,
  })
  const { isShuttingDown } = setupGracefulShutdown(db)
  const voiceId = buildAudioVoiceId({ provider: env.TTS_PROVIDER, voiceId: env.TTS_VOICE_ID })

  logger.info("generate-word-audio started", {
    maxWordsPerRun: env.WORD_AUDIO_MAX_PER_RUN,
    monthlyCharacterLimit: env.AUDIO_MONTHLY_CHARACTER_LIMIT,
    storageType: env.AUDIO_STORAGE_TYPE,
    ttsProvider: env.TTS_PROVIDER,
    voiceId,
  })

  try {
    const result = await service.audio.generateWordAudio(
      {
        isShuttingDown,
        maxWordsPerRun: env.WORD_AUDIO_MAX_PER_RUN,
        monthlyCharacterLimit: env.AUDIO_MONTHLY_CHARACTER_LIMIT,
        now: () => new Date(),
        voiceId,
      },
      {
        audioSynthesisUsageRepository: new DrizzleAudioSynthesisUsageRepository(db),
        wordAudioRepository: new DrizzleWordAudioRepository(db),
      },
      { audioStorage: createAudioStorage(), ttsClient },
    )
    logger.info("generate-word-audio completed", result)
    if (result.isMonthlyLimitReached) {
      throw new Error(
        `generate-word-audio: stopped at the monthly Polly character limit (AUDIO_MONTHLY_CHARACTER_LIMIT=${env.AUDIO_MONTHLY_CHARACTER_LIMIT})`,
      )
    }
    const failureCount = result.failedCount + result.retryLaterCount
    if (failureCount > 0) {
      throw new Error(`generate-word-audio: ${failureCount} word(s) failed (${result.failedCount} reached the attempt limit)`)
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  logger.error(
    "generate-word-audio failed",
    err instanceof Error ? err : new Error(String(err)),
  )
  process.exit(1)
})
