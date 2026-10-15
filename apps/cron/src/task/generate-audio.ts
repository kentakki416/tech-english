import { logger } from "@repo/logger"

import { env } from "../env"
import { buildAudioVoiceId } from "../lib/audio"
import { DrizzleAudioSynthesisUsageRepository, DrizzlePassageAudioRepository } from "../repository/drizzle"
import { runTask } from "../run-task"
import { assertAudioStorageAllowed, createAudioStorage, createTtsClient } from "../runtime/audio-clients"
import * as service from "../service"

/**
 * generate:audio
 *
 * 公開済みの問題の読み上げの音声（mp3 と単語の時刻）を作る。本番は EventBridge Scheduler → ECS RunTask で 1 時間ごとに
 * `node dist/task/generate-audio.js` を起動する想定（generate:questions とは独立）。
 *
 *   pnpm generate:audio                      # production は Polly、それ以外は無音の mp3 と等間隔の単語の時刻（TTS_PROVIDER の既定）
 *   TTS_PROVIDER=polly pnpm generate:audio   # ローカルで Polly を呼ぶ（手元の AWS の資格情報で課金される。無ければ warn を出して何もしない）
 */
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
