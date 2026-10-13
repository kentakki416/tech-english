import {
  and,
  asc,
  count,
  DrizzleClient,
  eq,
  inArray,
  lt,
  passageGlossaryEntries,
  passages,
  questions,
  sql,
} from "@repo/db"
import { isPassageStatus, type PassageStatus } from "@repo/domain"

import type {
  ClaimedPassage,
  CreatePassageInput,
  DraftContent,
  DraftGlossaryEntry,
  PassageClaim,
  PassageRepository,
} from "../passage-repository"

/**
 * 用語集の項目を位置で引くキー（insert の RETURNING の順序に頼らず id を引くため）
 */
const buildGlossaryPositionKey = (entry: Pick<DraftGlossaryEntry, "blockIndex" | "endOffset" | "startOffset">): string =>
  `${entry.blockIndex}:${entry.startOffset}:${entry.endOffset}`

/**
 * Drizzle 実装の PassageRepository
 */
export class DrizzlePassageRepository implements PassageRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  /**
   * 候補の select に行ロック（FOR UPDATE SKIP LOCKED）を付けて、同じ UPDATE 文で generating にする。
   * 別の実行がロック中の行は飛ばすので、実行が重なっても同じ行を二重に取らない。RETURNING の順序は保証されないので created_at, id で並べ直す
   */
  public async claimCollected(input: { limit: number; now: Date; passageId?: number }): Promise<ClaimedPassage[]> {
    const candidates = this._db
      .select({ id: passages.id })
      .from(passages)
      .where(
        and(
          eq(passages.status, "collected"),
          input.passageId === undefined ? undefined : eq(passages.id, input.passageId),
        ),
      )
      .orderBy(asc(passages.createdAt), asc(passages.id))
      .limit(input.limit)
      .for("update", { skipLocked: true })
    const rows = await this._db
      .update(passages)
      .set({ generationStartedAt: input.now, status: "generating" })
      .where(inArray(passages.id, candidates))
      .returning({
        id: passages.id,
        blocks: passages.blocks,
        generationAttemptCount: passages.generationAttemptCount,
        generationStartedAt: passages.generationStartedAt,
        title: passages.title,
        wordCount: passages.wordCount,
        createdAt: passages.createdAt,
      })
    return rows
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id - right.id)
      .map((row) => ({
        id: row.id,
        blocks: row.blocks,
        generationAttemptCount: row.generationAttemptCount,
        generationStartedAt: row.generationStartedAt ?? input.now,
        title: row.title,
        wordCount: row.wordCount,
      }))
  }

  public async countByStatus(status: PassageStatus): Promise<number> {
    const [row] = await this._db.select({ count: count() }).from(passages).where(eq(passages.status, status))
    return row?.count ?? 0
  }

  public async findStatusById(id: number): Promise<PassageStatus | null> {
    const [row] = await this._db.select({ status: passages.status }).from(passages).where(eq(passages.id, id))
    return row && isPassageStatus(row.status) ? row.status : null
  }

  /**
   * ON CONFLICT (content_hash) DO NOTHING で挿入し、RETURNING で返った行（実際に挿入した行）を数える
   */
  public async insertIgnoringDuplicates(inputs: CreatePassageInput[]): Promise<number> {
    if (inputs.length === 0) return 0
    const rows = await this._db
      .insert(passages)
      .values(inputs)
      .onConflictDoNothing({ target: passages.contentHash })
      .returning({ id: passages.id })
    return rows.length
  }

  public async markRejectedByLlm(
    claim: PassageClaim,
    input: { generationModel: string; generationPromptVersion: string; reason: string },
    now: Date,
  ): Promise<boolean> {
    const rows = await this._db
      .update(passages)
      .set({
        generatedAt: now,
        generationError: null,
        generationModel: input.generationModel,
        generationPromptVersion: input.generationPromptVersion,
        rejectReason: input.reason,
        status: "rejected",
      })
      .where(this._buildClaimCondition(claim))
      .returning({ id: passages.id })
    return rows.length > 0
  }

  /**
   * SET の右辺の列は更新前の値なので、CASE は「更新前の回数 + 1」で判定する
   */
  public async recordGenerationFailure(
    claim: PassageClaim,
    input: { error: string; maxAttempts: number },
  ): Promise<"collected" | "failed" | null> {
    const [row] = await this._db
      .update(passages)
      .set({
        generationAttemptCount: sql`${passages.generationAttemptCount} + 1`,
        generationError: input.error,
        status: sql`CASE WHEN ${passages.generationAttemptCount} + 1 >= ${input.maxAttempts} THEN 'failed' ELSE 'collected' END`,
      })
      .where(this._buildClaimCondition(claim))
      .returning({ status: passages.status })
    if (!row) return null
    return row.status === "failed" ? "failed" : "collected"
  }

  public async releaseClaim(claim: PassageClaim): Promise<void> {
    await this._db.update(passages).set({ status: "collected" }).where(this._buildClaimCondition(claim))
  }

  public async releaseStaleGenerating(startedBefore: Date): Promise<number> {
    const rows = await this._db
      .update(passages)
      .set({ status: "collected" })
      .where(and(eq(passages.status, "generating"), lt(passages.generationStartedAt, startedBefore)))
      .returning({ id: passages.id })
    return rows.length
  }

  /**
   * 1 トランザクションで ① passages を claim のガード付きで draft に更新（0 行なら false で終える）② 残っている設問・用語集を消す
   * ③ 用語集を insert して位置で id を引けるようにする ④ 設問を insert（targetGlossaryIndex → 用語集の id）
   */
  public async saveDraft(claim: PassageClaim, content: DraftContent, now: Date): Promise<boolean> {
    return this._db.transaction(async (tx) => {
      const updated = await tx
        .update(passages)
        .set({
          attentionReasons: content.attentionReasons,
          blocks: content.blocks,
          difficulty: content.difficulty,
          generatedAt: now,
          generationError: null,
          generationModel: content.generationModel,
          generationPromptVersion: content.generationPromptVersion,
          needsAttention: content.attentionReasons.length > 0,
          rejectReason: null,
          status: "draft",
          timeLimitSeconds: content.timeLimitSeconds,
        })
        .where(this._buildClaimCondition(claim))
        .returning({ id: passages.id })
      if (updated.length === 0) return false

      await tx.delete(questions).where(eq(questions.passageId, claim.id))
      await tx.delete(passageGlossaryEntries).where(eq(passageGlossaryEntries.passageId, claim.id))

      const glossaryRows = content.glossary.length === 0
        ? []
        : await tx
          .insert(passageGlossaryEntries)
          .values(content.glossary.map((entry) => ({ ...entry, passageId: claim.id })))
          .returning({
            id: passageGlossaryEntries.id,
            blockIndex: passageGlossaryEntries.blockIndex,
            endOffset: passageGlossaryEntries.endOffset,
            startOffset: passageGlossaryEntries.startOffset,
          })
      const glossaryIdByPosition = new Map(glossaryRows.map((row) => [buildGlossaryPositionKey(row), row.id]))

      if (content.questions.length > 0) {
        await tx.insert(questions).values(
          content.questions.map((question) => {
            const target = question.targetGlossaryIndex === null ? undefined : content.glossary[question.targetGlossaryIndex]
            return {
              choices: question.choices,
              correctChoiceIndex: question.correctChoiceIndex,
              evidenceBlockIndex: question.evidenceBlockIndex,
              evidenceQuote: question.evidenceQuote,
              explanationJa: question.explanationJa,
              orderIndex: question.orderIndex,
              passageId: claim.id,
              prompt: question.prompt,
              targetGlossaryEntryId: target ? glossaryIdByPosition.get(buildGlossaryPositionKey(target)) ?? null : null,
              type: question.type,
              verificationChoiceIndex: question.verificationChoiceIndex,
            }
          }),
        )
      }
      return true
    })
  }

  /**
   * 取得した実行だけが更新できる条件（generation_started_at を取得のトークンとして使う）
   */
  private _buildClaimCondition(claim: PassageClaim) {
    return and(
      eq(passages.id, claim.id),
      eq(passages.status, "generating"),
      eq(passages.generationStartedAt, claim.generationStartedAt),
    )
  }
}
