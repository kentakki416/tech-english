import { logger } from "@repo/logger"

import { env } from "../env"
import { buildAudioVoiceId } from "../lib/audio"
import { DrizzleAudioSynthesisUsageRepository, DrizzleWordAudioRepository } from "../repository/drizzle"
import { runTask } from "../run-task"
import { assertAudioStorageAllowed, createAudioStorage, createTtsClient } from "../runtime/audio-clients"
import * as service from "../service"

/**
 * generate:audio とは別の task にして独立に起動する（片方の失敗で片方を止めない）
 */
runTask("generate-word-audio", async ({ db }) => {
  assertAudioStorageAllowed("generate-word-audio")
  const ttsClient = await createTtsClient("generate-word-audio")
  if (!ttsClient) return

  const voiceId = buildAudioVoiceId({ provider: env.TTS_PROVIDER, voiceId: env.TTS_VOICE_ID })

  logger.info("generate-word-audio started", {
    maxWordsPerRun: env.WORD_AUDIO_MAX_PER_RUN,
    monthlyCharacterLimit: env.AUDIO_MONTHLY_CHARACTER_LIMIT,
    storageType: env.AUDIO_STORAGE_TYPE,
    ttsProvider: env.TTS_PROVIDER,
    voiceId,
  })

  const result = await service.audio.generateWordAudio(
    {
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
})
