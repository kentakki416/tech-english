import type { PrismaClient } from "@repo/db"
import { isAudioStatus, type PassageAudioManifest, type PassageBlock } from "@repo/domain"

import type {
  AudioClaim,
  AudioClaimOutcome,
  AudioClaimResult,
  CalculateTextHash,
  ClaimedAudioTarget,
  PassageAudioRepository,
} from "../passage-audio-repository"

/**
 * claimTargets の候補の $queryRaw の結果（列名は snake_case のまま。passage_audios の列は行が無ければ null）
 */
type AudioTargetQueryRow = {
  blocks: PassageBlock[]
  manifest: PassageAudioManifest | null
  passage_id: number
  status: string | null
  text_hash: string | null
}

/**
 * Prisma 実装の PassageAudioRepository。行ロック・ON CONFLICT の条件・CASE を Drizzle 実装と同じ SQL で書く。
 * 日時は ISO 文字列を timestamp にキャストして UTC のまま入れる（Prisma のセッションのタイムゾーンに依存させない）
 */
export class PrismaPassageAudioRepository implements PassageAudioRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  /**
   * Drizzle 実装と同じ手順を $transaction の中で行う。複数行の insert は配列を unnest で渡す
   */
  public async claimTargets(input: {
    calculateTextHash: CalculateTextHash
    limit: number
    now: Date
    voiceId: string
  }): Promise<ClaimedAudioTarget[]> {
    const now = input.now.toISOString()
    return this._prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<AudioTargetQueryRow[]>`
        SELECT passages.id AS passage_id, passages.blocks, passage_audios.manifest, passage_audios.status, passage_audios.text_hash
        FROM passages
        LEFT JOIN passage_audios ON passage_audios.passage_id = passages.id
        WHERE passages.status = 'published'
          AND (
            passage_audios.id IS NULL
            OR passage_audios.status = 'pending'
            OR (passage_audios.status = 'ready' AND passage_audios.updated_at < passages.published_at)
            OR (passage_audios.status = 'ready' AND passage_audios.voice_id <> ${input.voiceId})
          )
        ORDER BY passages.published_at ASC, passages.id ASC
        LIMIT ${input.limit}::integer
        FOR UPDATE OF passages SKIP LOCKED
      `
      if (candidates.length === 0) return []

      const passageIds = candidates.map((candidate) => candidate.passage_id)
      const textHashes = candidates.map((candidate) => input.calculateTextHash(candidate.blocks))
      const claimedRows = await tx.$queryRaw<{ passage_id: number }[]>`
        INSERT INTO passage_audios (passage_id, status, voice_id, text_hash, generation_started_at, updated_at)
        SELECT target.passage_id, 'generating', ${input.voiceId}, target.text_hash, ${now}::timestamp(3), ${now}::timestamp(3)
        FROM unnest(${passageIds}::integer[], ${textHashes}::text[]) AS target(passage_id, text_hash)
        ON CONFLICT (passage_id) DO UPDATE SET
          generation_started_at = ${now}::timestamp(3),
          status = 'generating',
          updated_at = ${now}::timestamp(3)
        WHERE passage_audios.status IN ('pending', 'ready')
        RETURNING passage_id
      `
      const claimedIds = new Set(claimedRows.map((row) => row.passage_id))
      return candidates
        .filter((candidate) => claimedIds.has(candidate.passage_id))
        .map((candidate) => ({
          blocks: candidate.blocks,
          generationStartedAt: input.now,
          passageId: candidate.passage_id,
          previous:
            candidate.status !== null && candidate.text_hash !== null && isAudioStatus(candidate.status)
              ? { manifest: candidate.manifest, status: candidate.status, textHash: candidate.text_hash }
              : null,
        }))
    })
  }

  public async completeClaim(
    claim: AudioClaim,
    outcome: AudioClaimOutcome,
    options: { calculateTextHash: CalculateTextHash; now: Date },
  ): Promise<AudioClaimResult> {
    const now = options.now.toISOString()
    const startedAt = claim.generationStartedAt.toISOString()
    return this._prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM passage_audios
        WHERE passage_id = ${claim.passageId}::integer
          AND status = 'generating'
          AND generation_started_at = ${startedAt}::timestamp(3)
        FOR UPDATE
      `
      if (claimed.length === 0) return "lost_claim"
      const claimWhere = { generationStartedAt: claim.generationStartedAt, passageId: claim.passageId, status: "generating" }

      if (outcome.kind !== "failed") {
        const passage = await tx.passage.findUnique({ select: { blocks: true }, where: { id: claim.passageId } })
        if (!passage || options.calculateTextHash(passage.blocks as PassageBlock[]) !== outcome.textHash) {
          await tx.passageAudio.updateMany({
            data: { generationStartedAt: null, status: "pending", updatedAt: options.now },
            where: claimWhere,
          })
          return "text_changed"
        }
      }

      if (outcome.kind === "ready") {
        await tx.passageAudio.updateMany({
          data: {
            attemptCount: 0,
            billedCharacters: outcome.billedCharacters,
            generatedAt: options.now,
            generationStartedAt: null,
            lastError: null,
            manifest: outcome.manifest,
            status: "ready",
            textHash: outcome.textHash,
            updatedAt: options.now,
            voiceId: outcome.voiceId,
          },
          where: claimWhere,
        })
        return "ready"
      }

      if (outcome.kind === "unchanged") {
        /**
         * manifest と generated_at は前の成功のまま（Drizzle 実装のコメントのとおり ready の CHECK 制約を満たす）。失敗の回数とエラーは消す
         */
        await tx.passageAudio.updateMany({
          data: { attemptCount: 0, generationStartedAt: null, lastError: null, status: "ready", updatedAt: options.now },
          where: claimWhere,
        })
        return "unchanged"
      }

      /**
       * 回数の +1 と状態の判定を 1 文で行うため $queryRaw で書く（SET の右辺の列は更新前の値）
       */
      const rows = await tx.$queryRaw<{ status: string }[]>`
        UPDATE passage_audios
        SET
          attempt_count = attempt_count + 1,
          generation_started_at = NULL,
          last_error = ${outcome.error},
          status = CASE WHEN attempt_count + 1 >= ${outcome.maxAttempts}::integer THEN 'failed' ELSE 'pending' END,
          updated_at = ${now}::timestamp(3)
        WHERE passage_id = ${claim.passageId}::integer
          AND status = 'generating'
          AND generation_started_at = ${startedAt}::timestamp(3)
        RETURNING status
      `
      return rows[0]?.status === "failed" ? "failed" : "retry_later"
    })
  }

  public async releaseClaim(claim: AudioClaim): Promise<void> {
    await this._prisma.passageAudio.updateMany({
      data: { generationStartedAt: null, status: "pending" },
      where: { generationStartedAt: claim.generationStartedAt, passageId: claim.passageId, status: "generating" },
    })
  }

  public async releaseStaleGenerating(startedBefore: Date): Promise<number> {
    const result = await this._prisma.passageAudio.updateMany({
      data: { generationStartedAt: null, status: "pending" },
      where: { generationStartedAt: { lt: startedBefore }, status: "generating" },
    })
    return result.count
  }
}
