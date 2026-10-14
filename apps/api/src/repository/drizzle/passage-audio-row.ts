import type { passageAudios } from "@repo/db"
import type { PassageAudio } from "@repo/domain"

/**
 * Drizzleの型
 */
export type PassageAudioRow = typeof passageAudios.$inferSelect

/**
 * Drizzleの型 → ドメインの型。PassageAudioRepository と PassageRepository（admin の詳細）で共有する
 */
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
