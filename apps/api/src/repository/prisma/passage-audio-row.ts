import type { Prisma as PrismaTypes } from "@repo/db"
import { isAudioStatus, type PassageAudio, type PassageAudioManifest } from "@repo/domain"

/**
 * Prismaの型
 */
export type PassageAudioRow = PrismaTypes.PassageAudioGetPayload<{}>

/**
 * Prismaの型 → ドメインの型。PassageAudioRepository と PassageRepository（admin の詳細）で共有する。
 * Prisma は CHECK 制約の値の集合を型に持たないので status を domain の判定関数で検証し（未知の値は throw）、
 * jsonb の manifest は生成タスクが書いた PassageAudioManifest として扱う
 */
export const convertPassageAudioRowToDomain = (row: PassageAudioRow): PassageAudio => {
  if (!isAudioStatus(row.status)) throw new Error(`Invalid passage audio status: id=${row.id}, status=${row.status}`)
  return {
    id: row.id,
    attemptCount: row.attemptCount,
    billedCharacters: row.billedCharacters,
    generatedAt: row.generatedAt,
    generationStartedAt: row.generationStartedAt,
    lastError: row.lastError,
    manifest: row.manifest as PassageAudioManifest | null,
    passageId: row.passageId,
    status: row.status,
    textHash: row.textHash,
    voiceId: row.voiceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
