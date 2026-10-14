import {
  and,
  asc,
  DrizzleClient,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  passageAudios,
  passages,
  sql,
} from "@repo/db"
import { isAudioStatus } from "@repo/domain"

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
 * 確保の候補の行（passage_audios の列は行が無ければ null）
 */
type AudioClaimCandidate = {
  previousStatus: string | null
  previousUpdatedAt: Date | null
  publishedAt: Date | null
}

/**
 * 候補をどの状態で確保するか。ready で、音声を作った後に公開し直されていない行（voice の変更・作り直しの依頼で選ばれた行）は ready のまま、
 * それ以外（行が無い・pending・公開し直された ready）は generating にする
 */
const resolveClaimStatus = (candidate: AudioClaimCandidate): AudioClaimStatus => {
  if (candidate.previousStatus !== "ready" || candidate.previousUpdatedAt === null) return "generating"
  const isRepublished = candidate.publishedAt !== null && candidate.previousUpdatedAt < candidate.publishedAt
  return isRepublished ? "generating" : "ready"
}

/**
 * Drizzle 実装の PassageAudioRepository
 */
export class DrizzlePassageAudioRepository implements PassageAudioRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  /**
   * 短いトランザクションで ① passages に passage_audios を left join して対象を選び、passages の行をロックする（FOR UPDATE OF passages SKIP LOCKED。
   * left join の nullable 側はロックできない）② generating で確保する行は insert し、既にある行は ON CONFLICT で generating にする
   * ③ ready のまま確保する行は generation_started_at だけを更新する（updated_at は今の値のまま）。
   * ロックするのは passages で更新するのは passage_audios なので、別の実行がほんの少し前に確保した行を古いスナップショットで取り直さないよう、
   * ②③ の更新にも確保の条件（pending か、確保中でない ready）を付け、RETURNING で返った行だけを確保できたものとする
   */
  public async claimTargets(input: {
    calculateTextHash: CalculateTextHash
    limit: number
    maxAttempts: number
    now: Date
    staleBefore: Date
    voiceId: string
  }): Promise<ClaimedAudioTarget[]> {
    const isNotClaimedRecently = or(isNull(passageAudios.generationStartedAt), lt(passageAudios.generationStartedAt, input.staleBefore))
    const needsRebuildInPlace = and(
      or(ne(passageAudios.voiceId, input.voiceId), isNotNull(passageAudios.regenerateRequestedAt)),
      lt(passageAudios.attemptCount, input.maxAttempts),
    )
    return this._db.transaction(async (tx) => {
      const candidates = await tx
        .select({
          blocks: passages.blocks,
          passageId: passages.id,
          previousManifest: passageAudios.manifest,
          previousRegenerateRequestedAt: passageAudios.regenerateRequestedAt,
          previousStatus: passageAudios.status,
          previousTextHash: passageAudios.textHash,
          previousUpdatedAt: passageAudios.updatedAt,
          publishedAt: passages.publishedAt,
        })
        .from(passages)
        .leftJoin(passageAudios, eq(passageAudios.passageId, passages.id))
        .where(
          and(
            eq(passages.status, "published"),
            or(
              isNull(passageAudios.id),
              eq(passageAudios.status, "pending"),
              and(
                eq(passageAudios.status, "ready"),
                isNotClaimedRecently,
                or(lt(passageAudios.updatedAt, passages.publishedAt), needsRebuildInPlace),
              ),
            ),
          ),
        )
        .orderBy(asc(passages.publishedAt), asc(passages.id))
        .limit(input.limit)
        .for("update", { of: passages, skipLocked: true })
      if (candidates.length === 0) return []

      const claimedStatuses = new Map<number, AudioClaimStatus>()
      const generatingCandidates = candidates.filter((candidate) => resolveClaimStatus(candidate) === "generating")
      if (generatingCandidates.length > 0) {
        const rows = await tx
          .insert(passageAudios)
          .values(
            generatingCandidates.map((candidate) => ({
              generationStartedAt: input.now,
              passageId: candidate.passageId,
              status: "generating" as const,
              textHash: input.calculateTextHash(candidate.blocks),
              updatedAt: input.now,
              voiceId: input.voiceId,
            })),
          )
          .onConflictDoUpdate({
            set: { generationStartedAt: input.now, status: "generating", updatedAt: input.now },
            setWhere: or(eq(passageAudios.status, "pending"), and(eq(passageAudios.status, "ready"), isNotClaimedRecently)),
            target: passageAudios.passageId,
          })
          .returning({ passageId: passageAudios.passageId })
        for (const row of rows) claimedStatuses.set(row.passageId, "generating")
      }

      const readyCandidates = candidates.filter((candidate) => resolveClaimStatus(candidate) === "ready")
      if (readyCandidates.length > 0) {
        const rows = await tx
          .update(passageAudios)
          /**
           * updated_at を明示しないと $onUpdate が今の時刻を入れ、公開し直しの判定（updated_at < published_at）が崩れる
           */
          .set({ generationStartedAt: input.now, updatedAt: sql`${passageAudios.updatedAt}` })
          .where(
            and(
              inArray(passageAudios.passageId, readyCandidates.map((candidate) => candidate.passageId)),
              eq(passageAudios.status, "ready"),
              isNotClaimedRecently,
              needsRebuildInPlace,
            ),
          )
          .returning({ passageId: passageAudios.passageId })
        for (const row of rows) claimedStatuses.set(row.passageId, "ready")
      }

      /**
       * RETURNING の順序は保証されないので、select の順（published_at → id）のまま確保できた行だけを返す
       */
      return candidates.flatMap((candidate) => {
        const claimedStatus = claimedStatuses.get(candidate.passageId)
        if (!claimedStatus) return []
        return [{
          blocks: candidate.blocks,
          claimedStatus,
          generationStartedAt: input.now,
          isRegenerationRequested: candidate.previousRegenerateRequestedAt !== null,
          passageId: candidate.passageId,
          previous:
            candidate.previousStatus !== null && candidate.previousTextHash !== null && isAudioStatus(candidate.previousStatus)
              ? {
                manifest: candidate.previousManifest,
                status: candidate.previousStatus,
                textHash: candidate.previousTextHash,
              }
              : null,
        }]
      })
    })
  }

  /**
   * 短いトランザクションで ① 確保した行を claim のガード付きで FOR UPDATE で読む（無ければ lost_claim）② ready / unchanged は今の本文の hash を
   * 求め直し、違えば pending に戻す（text_changed）③ 結果を書く。failed は manifest と text_hash を前の成功のまま残す（前の mp3 のキーを後で消すため）
   */
  public async completeClaim(
    claim: AudioClaim,
    outcome: AudioClaimOutcome,
    options: { calculateTextHash: CalculateTextHash; now: Date },
  ): Promise<AudioClaimResult> {
    return this._db.transaction(async (tx) => {
      const [claimed] = await tx
        .select({ regenerateRequestedAt: passageAudios.regenerateRequestedAt })
        .from(passageAudios)
        .where(this._buildClaimCondition(claim))
        .for("update")
      if (!claimed) return "lost_claim"

      if (outcome.kind !== "failed") {
        const [passage] = await tx.select({ blocks: passages.blocks }).from(passages).where(eq(passages.id, claim.passageId))
        if (!passage || options.calculateTextHash(passage.blocks) !== outcome.textHash) {
          await tx
            .update(passageAudios)
            .set({ generationStartedAt: null, status: "pending", updatedAt: options.now })
            .where(this._buildClaimCondition(claim))
          return "text_changed"
        }
      }

      /**
       * 確保の時刻までに出された作り直しの依頼はこの生成で応えたので消す。確保の後に出された依頼は残し、次の実行で作り直す
       */
      const regenerateRequestedAt = claimed.regenerateRequestedAt !== null && claimed.regenerateRequestedAt > claim.generationStartedAt
        ? claimed.regenerateRequestedAt
        : null

      if (outcome.kind === "ready") {
        await tx
          .update(passageAudios)
          .set({
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
          })
          .where(this._buildClaimCondition(claim))
        return "ready"
      }

      if (outcome.kind === "unchanged") {
        /**
         * updated_at が進むので、api は公開し直しの後でも ready を返すようになる。manifest と generated_at は前の成功のまま
         * （service は manifest がある行だけを unchanged にし、manifest と generated_at は ready の書き込みで一緒に入って消されないので、
         * ready の CHECK 制約を満たす）。pending に戻された行（失敗の後など）からも来るので、失敗の回数とエラーは ready と同じく消す
         */
        await tx
          .update(passageAudios)
          .set({
            attemptCount: 0,
            generationStartedAt: null,
            lastError: null,
            regenerateRequestedAt,
            status: "ready",
            updatedAt: options.now,
          })
          .where(this._buildClaimCondition(claim))
        return "unchanged"
      }

      if (claim.claimedStatus === "ready") {
        /**
         * ready のまま確保した行は failed にせず、前の音声を出し続ける（updated_at も進めない）。失敗が上限に達した行は claimTargets が取らない
         */
        const [failed] = await tx
          .update(passageAudios)
          .set({
            attemptCount: sql`${passageAudios.attemptCount} + 1`,
            generationStartedAt: null,
            lastError: outcome.error,
            updatedAt: sql`${passageAudios.updatedAt}`,
          })
          .where(this._buildClaimCondition(claim))
          .returning({ attemptCount: passageAudios.attemptCount })
        return (failed?.attemptCount ?? 0) >= outcome.maxAttempts ? "failed" : "retry_later"
      }

      /**
       * SET の右辺の列は更新前の値なので、CASE は「更新前の回数 + 1」で判定する
       */
      const [failed] = await tx
        .update(passageAudios)
        .set({
          attemptCount: sql`${passageAudios.attemptCount} + 1`,
          generationStartedAt: null,
          lastError: outcome.error,
          status: sql`CASE WHEN ${passageAudios.attemptCount} + 1 >= ${outcome.maxAttempts} THEN 'failed' ELSE 'pending' END`,
          updatedAt: options.now,
        })
        .where(this._buildClaimCondition(claim))
        .returning({ status: passageAudios.status })
      return failed?.status === "failed" ? "failed" : "retry_later"
    })
  }

  public async deleteByPassageId(passageId: number): Promise<void> {
    await this._db.delete(passageAudios).where(eq(passageAudios.passageId, passageId))
  }

  public async findRejected(staleBefore: Date): Promise<RejectedPassageAudio[]> {
    return this._db
      .select({ manifest: passageAudios.manifest, passageId: passageAudios.passageId })
      .from(passageAudios)
      .innerJoin(passages, eq(passages.id, passageAudios.passageId))
      .where(
        and(
          eq(passages.status, "rejected"),
          or(isNull(passageAudios.generationStartedAt), lt(passageAudios.generationStartedAt, staleBefore)),
        ),
      )
      .orderBy(asc(passageAudios.passageId))
  }

  public async releaseClaim(claim: AudioClaim): Promise<void> {
    if (claim.claimedStatus === "ready") {
      await this._db
        .update(passageAudios)
        .set({ generationStartedAt: null, updatedAt: sql`${passageAudios.updatedAt}` })
        .where(this._buildClaimCondition(claim))
      return
    }
    await this._db
      .update(passageAudios)
      .set({ generationStartedAt: null, status: "pending" })
      .where(this._buildClaimCondition(claim))
  }

  public async releaseStaleGenerating(startedBefore: Date): Promise<number> {
    const rows = await this._db
      .update(passageAudios)
      .set({ generationStartedAt: null, status: "pending" })
      .where(and(eq(passageAudios.status, "generating"), lt(passageAudios.generationStartedAt, startedBefore)))
      .returning({ id: passageAudios.id })
    return rows.length
  }

  /**
   * 確保した実行だけが更新できる条件（確保したときの状態と、generation_started_at を確保のトークンとして使う）
   */
  private _buildClaimCondition(claim: AudioClaim) {
    return and(
      eq(passageAudios.passageId, claim.passageId),
      eq(passageAudios.status, claim.claimedStatus),
      eq(passageAudios.generationStartedAt, claim.generationStartedAt),
    )
  }
}
