import {
  and,
  asc,
  DrizzleClient,
  eq,
  inArray,
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
  CalculateTextHash,
  ClaimedAudioTarget,
  PassageAudioRepository,
} from "../passage-audio-repository"

/**
 * 確保した行を作り直すときに上書きしてよい状態。確保の select と insert の間に別の実行が確保した行（generating）や、
 * 管理者の再試行を待つ行（failed）は取り直さない
 */
const RECLAIMABLE_STATUSES = ["pending", "ready"] as const

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
   * left join の nullable 側はロックできない。ready は公開し直されたものと、voice_id が今の voice と違うもの）② 行を insert し、既にある行は ON CONFLICT で generating にする。
   * ロックするのは passages で更新するのは passage_audios なので、別の実行がほんの少し前に確保した行を古いスナップショットで取り直さないよう、
   * conflict の更新は status が pending / ready の行だけにし、RETURNING で返った行だけを確保できたものとする
   */
  public async claimTargets(input: {
    calculateTextHash: CalculateTextHash
    limit: number
    now: Date
    voiceId: string
  }): Promise<ClaimedAudioTarget[]> {
    return this._db.transaction(async (tx) => {
      const candidates = await tx
        .select({
          blocks: passages.blocks,
          passageId: passages.id,
          previousManifest: passageAudios.manifest,
          previousStatus: passageAudios.status,
          previousTextHash: passageAudios.textHash,
        })
        .from(passages)
        .leftJoin(passageAudios, eq(passageAudios.passageId, passages.id))
        .where(
          and(
            eq(passages.status, "published"),
            or(
              isNull(passageAudios.id),
              eq(passageAudios.status, "pending"),
              and(eq(passageAudios.status, "ready"), lt(passageAudios.updatedAt, passages.publishedAt)),
              and(eq(passageAudios.status, "ready"), ne(passageAudios.voiceId, input.voiceId)),
            ),
          ),
        )
        .orderBy(asc(passages.publishedAt), asc(passages.id))
        .limit(input.limit)
        .for("update", { of: passages, skipLocked: true })
      if (candidates.length === 0) return []

      const claimedRows = await tx
        .insert(passageAudios)
        .values(
          candidates.map((candidate) => ({
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
          setWhere: inArray(passageAudios.status, RECLAIMABLE_STATUSES),
          target: passageAudios.passageId,
        })
        .returning({ passageId: passageAudios.passageId })
      const claimedIds = new Set(claimedRows.map((row) => row.passageId))

      /**
       * RETURNING の順序は保証されないので、select の順（published_at → id）のまま確保できた行だけを返す
       */
      return candidates
        .filter((candidate) => claimedIds.has(candidate.passageId))
        .map((candidate) => ({
          blocks: candidate.blocks,
          generationStartedAt: input.now,
          passageId: candidate.passageId,
          previous:
            candidate.previousStatus !== null && candidate.previousTextHash !== null && isAudioStatus(candidate.previousStatus)
              ? {
                manifest: candidate.previousManifest,
                status: candidate.previousStatus,
                textHash: candidate.previousTextHash,
              }
              : null,
        }))
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
        .select({ id: passageAudios.id })
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
          .set({ attemptCount: 0, generationStartedAt: null, lastError: null, status: "ready", updatedAt: options.now })
          .where(this._buildClaimCondition(claim))
        return "unchanged"
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

  public async releaseClaim(claim: AudioClaim): Promise<void> {
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
   * 確保した実行だけが更新できる条件（generation_started_at を確保のトークンとして使う）
   */
  private _buildClaimCondition(claim: AudioClaim) {
    return and(
      eq(passageAudios.passageId, claim.passageId),
      eq(passageAudios.status, "generating"),
      eq(passageAudios.generationStartedAt, claim.generationStartedAt),
    )
  }
}
