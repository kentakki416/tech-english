import type { PrismaClient } from "@repo/db"
import { isAudioStatus, type PassageAudioManifest, type PassageBlock } from "@repo/domain"

import type {
  AudioClaim,
  AudioClaimOutcome,
  AudioClaimResult,
  AudioClaimStatus,
  CalculateTextHash,
  ClaimedAudioTarget,
  PassageAudioRepository,
  RejectedPassageAudio,
} from "../passage-audio-repository"

/**
 * claimTargets の候補の $queryRaw の結果（列名は snake_case のまま。passage_audios の列は行が無ければ null）
 */
type AudioTargetQueryRow = {
  blocks: PassageBlock[]
  manifest: PassageAudioManifest | null
  passage_id: number
  published_at: Date | null
  regenerate_requested_at: Date | null
  status: string | null
  text_hash: string | null
  updated_at: Date | null
}

/**
 * 候補をどの状態で確保するか（Drizzle 実装と同じ判定）。ready で、音声を作った後に公開し直されていない行は ready のまま、それ以外は generating
 */
const resolveClaimStatus = (candidate: AudioTargetQueryRow): AudioClaimStatus => {
  if (candidate.status !== "ready" || candidate.updated_at === null) return "generating"
  const isRepublished = candidate.published_at !== null && candidate.updated_at < candidate.published_at
  return isRepublished ? "generating" : "ready"
}

/**
 * Prisma 実装の PassageAudioRepository。行ロック・ON CONFLICT の条件・CASE を Drizzle 実装と同じ SQL で書く。
 * 日時は ISO 文字列を timestamp にキャストして UTC のまま入れる（Prisma のセッションのタイムゾーンに依存させない）。
 * ready のまま確保した行の更新は $queryRaw / $executeRaw で書く（updateMany は @updatedAt で updated_at を進め、公開し直しの判定が崩れるため）
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
    maxAttempts: number
    now: Date
    staleBefore: Date
    voiceId: string
  }): Promise<ClaimedAudioTarget[]> {
    const now = input.now.toISOString()
    const staleBefore = input.staleBefore.toISOString()
    return this._prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<AudioTargetQueryRow[]>`
        SELECT passages.id AS passage_id, passages.blocks, passages.published_at, passage_audios.manifest,
          passage_audios.regenerate_requested_at, passage_audios.status, passage_audios.text_hash, passage_audios.updated_at
        FROM passages
        LEFT JOIN passage_audios ON passage_audios.passage_id = passages.id
        WHERE passages.status = 'published'
          AND (
            passage_audios.id IS NULL
            OR passage_audios.status = 'pending'
            OR (
              passage_audios.status = 'ready'
              AND (passage_audios.generation_started_at IS NULL OR passage_audios.generation_started_at < ${staleBefore}::timestamp(3))
              AND (
                passage_audios.updated_at < passages.published_at
                OR (
                  (passage_audios.voice_id <> ${input.voiceId} OR passage_audios.regenerate_requested_at IS NOT NULL)
                  AND passage_audios.attempt_count < ${input.maxAttempts}::integer
                )
              )
            )
          )
        ORDER BY passages.published_at ASC, passages.id ASC
        LIMIT ${input.limit}::integer
        FOR UPDATE OF passages SKIP LOCKED
      `
      if (candidates.length === 0) return []

      const claimedStatuses = new Map<number, AudioClaimStatus>()
      const generatingCandidates = candidates.filter((candidate) => resolveClaimStatus(candidate) === "generating")
      if (generatingCandidates.length > 0) {
        const passageIds = generatingCandidates.map((candidate) => candidate.passage_id)
        const textHashes = generatingCandidates.map((candidate) => input.calculateTextHash(candidate.blocks))
        const rows = await tx.$queryRaw<{ passage_id: number }[]>`
          INSERT INTO passage_audios (passage_id, status, voice_id, text_hash, generation_started_at, updated_at)
          SELECT target.passage_id, 'generating', ${input.voiceId}, target.text_hash, ${now}::timestamp(3), ${now}::timestamp(3)
          FROM unnest(${passageIds}::integer[], ${textHashes}::text[]) AS target(passage_id, text_hash)
          ON CONFLICT (passage_id) DO UPDATE SET
            generation_started_at = ${now}::timestamp(3),
            status = 'generating',
            updated_at = ${now}::timestamp(3)
          WHERE passage_audios.status = 'pending'
            OR (
              passage_audios.status = 'ready'
              AND (passage_audios.generation_started_at IS NULL OR passage_audios.generation_started_at < ${staleBefore}::timestamp(3))
            )
          RETURNING passage_id
        `
        for (const row of rows) claimedStatuses.set(row.passage_id, "generating")
      }

      const readyCandidates = candidates.filter((candidate) => resolveClaimStatus(candidate) === "ready")
      if (readyCandidates.length > 0) {
        const passageIds = readyCandidates.map((candidate) => candidate.passage_id)
        const rows = await tx.$queryRaw<{ passage_id: number }[]>`
          UPDATE passage_audios
          SET generation_started_at = ${now}::timestamp(3)
          WHERE passage_id = ANY(${passageIds}::integer[])
            AND status = 'ready'
            AND (generation_started_at IS NULL OR generation_started_at < ${staleBefore}::timestamp(3))
            AND (voice_id <> ${input.voiceId} OR regenerate_requested_at IS NOT NULL)
            AND attempt_count < ${input.maxAttempts}::integer
          RETURNING passage_id
        `
        for (const row of rows) claimedStatuses.set(row.passage_id, "ready")
      }

      return candidates.flatMap((candidate) => {
        const claimedStatus = claimedStatuses.get(candidate.passage_id)
        if (!claimedStatus) return []
        return [{
          blocks: candidate.blocks,
          claimedStatus,
          generationStartedAt: input.now,
          isRegenerationRequested: candidate.regenerate_requested_at !== null,
          passageId: candidate.passage_id,
          previous:
            candidate.status !== null && candidate.text_hash !== null && isAudioStatus(candidate.status)
              ? { manifest: candidate.manifest, status: candidate.status, textHash: candidate.text_hash }
              : null,
        }]
      })
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
      const claimed = await tx.$queryRaw<{ regenerate_requested_at: Date | null }[]>`
        SELECT regenerate_requested_at FROM passage_audios
        WHERE passage_id = ${claim.passageId}::integer
          AND status = ${claim.claimedStatus}
          AND generation_started_at = ${startedAt}::timestamp(3)
        FOR UPDATE
      `
      const [claimedRow] = claimed
      if (!claimedRow) return "lost_claim"
      const claimWhere = { generationStartedAt: claim.generationStartedAt, passageId: claim.passageId, status: claim.claimedStatus }

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

      /**
       * 確保の時刻までに出された作り直しの依頼だけを消す（Drizzle 実装と同じ）
       */
      const regenerateRequestedAt = claimedRow.regenerate_requested_at !== null && claimedRow.regenerate_requested_at > claim.generationStartedAt
        ? claimedRow.regenerate_requested_at
        : null

      if (outcome.kind === "ready") {
        await tx.passageAudio.updateMany({
          data: {
            attemptCount: 0,
            billedCharacters: outcome.billedCharacters,
            generatedAt: options.now,
            generationStartedAt: null,
            lastError: null,
            manifest: outcome.manifest,
            regenerateRequestedAt,
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
          data: {
            attemptCount: 0,
            generationStartedAt: null,
            lastError: null,
            regenerateRequestedAt,
            status: "ready",
            updatedAt: options.now,
          },
          where: claimWhere,
        })
        return "unchanged"
      }

      if (claim.claimedStatus === "ready") {
        /**
         * ready のまま確保した行は failed にせず、前の音声を出し続ける（updated_at も進めない）
         */
        const rows = await tx.$queryRaw<{ attempt_count: number }[]>`
          UPDATE passage_audios
          SET
            attempt_count = attempt_count + 1,
            generation_started_at = NULL,
            last_error = ${outcome.error}
          WHERE passage_id = ${claim.passageId}::integer
            AND status = 'ready'
            AND generation_started_at = ${startedAt}::timestamp(3)
          RETURNING attempt_count
        `
        return (rows[0]?.attempt_count ?? 0) >= outcome.maxAttempts ? "failed" : "retry_later"
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

  public async deleteByPassageId(passageId: number): Promise<void> {
    await this._prisma.passageAudio.deleteMany({ where: { passageId } })
  }

  public async findRejected(staleBefore: Date): Promise<RejectedPassageAudio[]> {
    const rows = await this._prisma.passageAudio.findMany({
      orderBy: { passageId: "asc" },
      select: { manifest: true, passageId: true },
      where: {
        OR: [{ generationStartedAt: null }, { generationStartedAt: { lt: staleBefore } }],
        passage: { status: "rejected" },
      },
    })
    return rows.map((row) => ({ manifest: row.manifest as PassageAudioManifest | null, passageId: row.passageId }))
  }

  public async releaseClaim(claim: AudioClaim): Promise<void> {
    if (claim.claimedStatus === "ready") {
      await this._prisma.$executeRaw`
        UPDATE passage_audios
        SET generation_started_at = NULL
        WHERE passage_id = ${claim.passageId}::integer
          AND status = 'ready'
          AND generation_started_at = ${claim.generationStartedAt.toISOString()}::timestamp(3)
      `
      return
    }
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
