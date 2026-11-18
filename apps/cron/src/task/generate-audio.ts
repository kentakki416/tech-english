import { logger } from "@repo/logger"

import { env } from "../env"
import { buildAudioVoiceId } from "../lib/audio"
import { DrizzleAudioSynthesisUsageRepository, DrizzlePassageAudioRepository } from "../repository/drizzle"
import { runTask } from "../run-task"
import { assertAudioStorageAllowed, createAudioStorage, createTtsClient } from "../runtime/audio-clients"
import * as service from "../service"

runTask("generate-audio", async ({ db }) => {
  assertAudioStorageAllowed("generate-audio")
  const ttsClient = await createTtsClient("generate-audio")
  if (!ttsClient) return

  const voiceId = buildAudioVoiceId({ provider: env.TTS_PROVIDER, voiceId: env.TTS_VOICE_ID })

  logger.info("generate-audio started", {
    maxPassagesPerRun: env.AUDIO_MAX_PASSAGES_PER_RUN,
    monthlyCharacterLimit: env.AUDIO_MONTHLY_CHARACTER_LIMIT,
    storageType: env.AUDIO_STORAGE_TYPE,
    ttsProvider: env.TTS_PROVIDER,
    voiceId,
  })

  const result = await service.audio.generateAudio(
    {
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
  if (result.isMonthlyLimitReached) {
    throw new Error(`generate-audio: stopped at the monthly Polly character limit (AUDIO_MONTHLY_CHARACTER_LIMIT=${env.AUDIO_MONTHLY_CHARACTER_LIMIT})`)
  }
  const failureCount = result.failedCount + result.retryLaterCount
  if (failureCount > 0) {
    throw new Error(
      `generate-audio: ${failureCount} passage(s) failed (${result.failedCount} reached the attempt limit)`,
    )
  }
})
