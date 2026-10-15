import type { passageAudios } from "@repo/db"
import type { PassageAudio } from "@repo/domain"

export type PassageAudioRow = typeof passageAudios.$inferSelect

export const convertPassageAudioRowToDomain = (row: PassageAudioRow): PassageAudio => ({
  id: row.id,
  attemptCount: row.attemptCount,
  billedCharacters: row.billedCharacters,
  generatedAt: row.generatedAt,
  generationStartedAt: row.generationStartedAt,
  lastError: row.lastError,
  manifest: row.manifest,
  passageId: row.passageId,
  regenerateRequestedAt: row.regenerateRequestedAt,
  status: row.status,
  textHash: row.textHash,
  voiceId: row.voiceId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})
