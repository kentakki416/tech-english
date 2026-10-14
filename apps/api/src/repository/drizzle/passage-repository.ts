import {
  and,
  asc,
  contentSources,
  count,
  desc,
  DrizzleClient,
  eq,
  gt,
  inArray,
  lt,
  notExists,
  notInArray,
  or,
  passageGlossaryEntries,
  passages,
  questions,
  readingAttempts,
  sourceDocuments,
  sql,
} from "@repo/db"
import { type GlossaryEntry, type Passage, PASSAGE_STATUSES, type PassageStatus, type Question } from "@repo/domain"

import type {
  AdminPassageDetail,
  AdminPassageListItem,
  AdminPassageListQuery,
  DraftEditContent,
  PassageRepository,
  PassageTransition,
  RestoredPassageStatus,
} from "../passage-repository"

/**
 * Drizzleの型
 */
type PassageRow = typeof passages.$inferSelect
type GlossaryEntryRow = typeof passageGlossaryEntries.$inferSelect
type QuestionRow = typeof questions.$inferSelect

/**
 * 挑戦の件数（状態を問わない）。passages を FROM に持つクエリの select で使う
 */
const ATTEMPT_COUNT_SQL = sql<number>`(SELECT count(*) FROM ${readingAttempts} WHERE ${readingAttempts.passageId} = ${passages.id})`.mapWith(Number)

/**
 * 設問の数。passages を FROM に持つクエリの select で使う
 */
const QUESTION_COUNT_SQL = sql<number>`(SELECT count(*) FROM ${questions} WHERE ${questions.passageId} = ${passages.id})`.mapWith(Number)

/**
 * 生成待ち（collected）に戻すときに書く値。生成の記録・却下の理由・確認の記録・要確認を空にし、失敗の回数を 0 に戻す
 * （英文とタイトルは残す。和訳は blocks から別に外す）。再生成と、設問の無い却下の取り消しで使う
 */
const RESET_TO_COLLECTED_VALUES = {
  attentionReasons: [],
  difficulty: null,
  generatedAt: null,
  generationAttemptCount: 0,
  generationError: null,
  generationModel: null,
  generationPromptVersion: null,
  generationStartedAt: null,
  needsAttention: false,
  rejectReason: null,
  reviewedAt: null,
  status: "collected",
  timeLimitSeconds: null,
} satisfies Partial<typeof passages.$inferInsert>

/**
 * blocks から和訳を外す（collected に戻すとき）
 */
const removeTranslations = (blocks: PassageRow["blocks"]): PassageRow["blocks"] =>
  blocks.map(({ translationJa: _translationJa, ...block }) => block)

/**
 * Drizzleの型 → ドメインの型
 */
const convertPassageRowToDomain = (row: PassageRow): Passage => ({
  id: row.id,
  attentionReasons: row.attentionReasons,
  blocks: row.blocks,
  contentHash: row.contentHash,
  difficulty: row.difficulty,
  generatedAt: row.generatedAt,
  generationAttemptCount: row.generationAttemptCount,
  generationError: row.generationError,
  generationModel: row.generationModel,
  generationPromptVersion: row.generationPromptVersion,
  generationStartedAt: row.generationStartedAt,
  needsAttention: row.needsAttention,
  publishedAt: row.publishedAt,
  rejectReason: row.rejectReason,
  reviewedAt: row.reviewedAt,
  sourceCommitSha: row.sourceCommitSha,
  sourceDocumentId: row.sourceDocumentId,
  sourcePath: row.sourcePath,
  sourceRetrievedAt: row.sourceRetrievedAt,
  status: row.status,
  timeLimitSeconds: row.timeLimitSeconds,
  title: row.title,
  wordCount: row.wordCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const convertGlossaryEntryRowToDomain = (row: GlossaryEntryRow): GlossaryEntry => ({
  id: row.id,
  blockIndex: row.blockIndex,
  endOffset: row.endOffset,
  lemma: row.lemma,
  meaningJa: row.meaningJa,
  noteJa: row.noteJa,
  partOfSpeech: row.partOfSpeech,
  passageId: row.passageId,
  startOffset: row.startOffset,
  surface: row.surface,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const convertQuestionRowToDomain = (row: QuestionRow): Question => ({
  id: row.id,
  choices: row.choices,
  correctChoiceIndex: row.correctChoiceIndex,
  evidenceBlockIndex: row.evidenceBlockIndex,
  evidenceQuote: row.evidenceQuote,
  explanationJa: row.explanationJa,
  orderIndex: row.orderIndex,
  passageId: row.passageId,
  prompt: row.prompt,
  targetGlossaryEntryId: row.targetGlossaryEntryId,
  type: row.type,
  verificationChoiceIndex: row.verificationChoiceIndex,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Drizzle 実装の PassageRepository
 */
export class DrizzlePassageRepository implements PassageRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async clearAttention(id: number): Promise<boolean> {
    const rows = await this._db
      .update(passages)
      .set({ attentionReasons: [], needsAttention: false })
      .where(eq(passages.id, id))
      .returning({ id: passages.id })
    return rows.length > 0
  }

  public async countByStatus(): Promise<Record<PassageStatus, number>> {
    const rows = await this._db
      .select({ count: count(), status: passages.status })
      .from(passages)
      .groupBy(passages.status)
    const counts = Object.fromEntries(PASSAGE_STATUSES.map((status) => [status, 0])) as Record<PassageStatus, number>
    for (const row of rows) counts[row.status] = row.count
    return counts
  }

  /**
   * 保存・状態の遷移の前の検査と、保存した直後の再取得に使うので、read replica の遅延を避けて primary から読む
   */
  public async findAdminDetail(id: number): Promise<AdminPassageDetail | null> {
    const db = this._db.$primary
    const [row] = await db
      .select({
        attemptCount: ATTEMPT_COUNT_SQL,
        passage: passages,
        sourceId: contentSources.id,
        sourceName: contentSources.name,
      })
      .from(passages)
      .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
      .innerJoin(contentSources, eq(sourceDocuments.sourceId, contentSources.id))
      .where(eq(passages.id, id))
    if (!row) return null

    const [glossaryRows, questionRows] = await Promise.all([
      db
        .select()
        .from(passageGlossaryEntries)
        .where(eq(passageGlossaryEntries.passageId, id))
        .orderBy(asc(passageGlossaryEntries.blockIndex), asc(passageGlossaryEntries.startOffset), asc(passageGlossaryEntries.id)),
      db.select().from(questions).where(eq(questions.passageId, id)).orderBy(asc(questions.orderIndex)),
    ])
    return {
      attemptCount: row.attemptCount,
      glossary: glossaryRows.map(convertGlossaryEntryRowToDomain),
      passage: convertPassageRowToDomain(row.passage),
      questions: questionRows.map(convertQuestionRowToDomain),
      source: { id: row.sourceId, name: row.sourceName },
    }
  }

  public async findAdminList(query: AdminPassageListQuery): Promise<AdminPassageListItem[]> {
    const isDraft = query.status === "draft"
    const rows = await this._db
      .select({
        attemptCount: ATTEMPT_COUNT_SQL,
        passage: passages,
        questionCount: QUESTION_COUNT_SQL,
        sourceId: contentSources.id,
        sourceName: contentSources.name,
      })
      .from(passages)
      .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
      .innerJoin(contentSources, eq(sourceDocuments.sourceId, contentSources.id))
      .where(
        and(
          eq(passages.status, query.status),
          query.sourceId === undefined ? undefined : eq(contentSources.id, query.sourceId),
          query.needsAttention === undefined ? undefined : eq(passages.needsAttention, query.needsAttention),
          this._buildCursorCondition(query),
        ),
      )
      .orderBy(
        ...(isDraft
          ? [desc(passages.needsAttention), asc(passages.updatedAt), asc(passages.id)]
          : [desc(passages.updatedAt), desc(passages.id)]),
      )
      .limit(query.limit + 1)
    return rows.map((row) => ({
      attemptCount: row.attemptCount,
      passage: convertPassageRowToDomain(row.passage),
      questionCount: row.questionCount,
      source: { id: row.sourceId, name: row.sourceName },
    }))
  }

  /**
   * 1 トランザクションで ① 状態と挑戦の有無を確かめて passages の行をロックする（挑戦の insert は FK で同じ行の
   * FOR KEY SHARE を取るので、ここで FOR UPDATE すると同時に始まった挑戦と直列になる）② 設問・用語集を消す ③ passages を戻す
   */
  public async resetForRegeneration(id: number, from: PassageStatus[]): Promise<boolean> {
    return this._db.transaction(async (tx) => {
      const [row] = await tx
        .select({ blocks: passages.blocks })
        .from(passages)
        .where(
          and(
            eq(passages.id, id),
            inArray(passages.status, from),
            notExists(tx.select({ id: readingAttempts.id }).from(readingAttempts).where(eq(readingAttempts.passageId, passages.id))),
          ),
        )
        .for("update")
      if (!row) return false

      await tx.delete(questions).where(eq(questions.passageId, id))
      await tx.delete(passageGlossaryEntries).where(eq(passageGlossaryEntries.passageId, id))
      await tx
        .update(passages)
        .set({ ...RESET_TO_COLLECTED_VALUES, blocks: removeTranslations(row.blocks) })
        .where(eq(passages.id, id))
      return true
    })
  }

  /**
   * 1 トランザクションで ① rejected の行をロックする（再生成の resetForRegeneration も同じ行を FOR UPDATE するので、
   * 設問の有無の確認と書き込みの間に設問が消されない）② 設問の有無で戻す状態を決める ③ passages を書く。
   * collected に戻すときは resetForRegeneration と同じ状態にする（用語集が残っていれば消し、和訳を外す）
   */
  public async restoreRejected(id: number): Promise<RestoredPassageStatus | null> {
    return this._db.transaction(async (tx) => {
      const [row] = await tx
        .select({ blocks: passages.blocks })
        .from(passages)
        .where(and(eq(passages.id, id), eq(passages.status, "rejected")))
        .for("update")
      if (!row) return null

      const [question] = await tx.select({ id: questions.id }).from(questions).where(eq(questions.passageId, id)).limit(1)
      if (question) {
        await tx.update(passages).set({ rejectReason: null, status: "draft" }).where(eq(passages.id, id))
        return "draft"
      }

      await tx.delete(passageGlossaryEntries).where(eq(passageGlossaryEntries.passageId, id))
      await tx
        .update(passages)
        .set({ ...RESET_TO_COLLECTED_VALUES, blocks: removeTranslations(row.blocks) })
        .where(eq(passages.id, id))
      return "collected"
    })
  }

  public async transitionStatus(id: number, transition: PassageTransition): Promise<boolean> {
    const rows = await this._db
      .update(passages)
      .set({
        ...(transition.publishedAt === undefined ? {} : { publishedAt: transition.publishedAt }),
        ...(transition.rejectReason === undefined ? {} : { rejectReason: transition.rejectReason }),
        ...(transition.reviewedAt === undefined ? {} : { reviewedAt: transition.reviewedAt }),
        status: transition.to,
      })
      .where(and(eq(passages.id, id), inArray(passages.status, transition.from)))
      .returning({ id: passages.id })
    return rows.length > 0
  }

  /**
   * 1 トランザクションで ① passages を draft のガード付きで更新（0 行なら false で終える）② 用語集：リクエストに無いものを消し、
   * 既存を更新、新規を insert して index → id の配列を作る ③ 設問：リクエストに無いものを消し、残す行の order_index を
   * -(order_index + 1) に退避してから最終値で更新（(passage_id, order_index) の unique 違反を避ける）、新規を insert する。
   * 新規の行は RETURNING の順序に頼らず id を対応づけるため 1 件ずつ insert する
   */
  public async updateDraftContent(id: number, content: DraftEditContent): Promise<boolean> {
    return this._db.transaction(async (tx) => {
      const updated = await tx
        .update(passages)
        .set({
          blocks: content.blocks,
          difficulty: content.difficulty,
          timeLimitSeconds: content.timeLimitSeconds,
          title: content.title,
        })
        .where(and(eq(passages.id, id), eq(passages.status, "draft")))
        .returning({ id: passages.id })
      if (updated.length === 0) return false

      const keptGlossaryIds = content.glossary.flatMap((entry) => (entry.id === null ? [] : [entry.id]))
      await tx
        .delete(passageGlossaryEntries)
        .where(and(eq(passageGlossaryEntries.passageId, id), notInArray(passageGlossaryEntries.id, keptGlossaryIds)))
      const glossaryIds: number[] = []
      for (const { id: entryId, ...values } of content.glossary) {
        if (entryId === null) {
          const [inserted] = await tx
            .insert(passageGlossaryEntries)
            .values({ ...values, passageId: id })
            .returning({ id: passageGlossaryEntries.id })
          glossaryIds.push(inserted.id)
          continue
        }
        const rows = await tx
          .update(passageGlossaryEntries)
          .set(values)
          .where(and(eq(passageGlossaryEntries.id, entryId), eq(passageGlossaryEntries.passageId, id)))
          .returning({ id: passageGlossaryEntries.id })
        if (rows.length === 0) throw new Error(`Glossary entry not found: passageId=${id}, id=${entryId}`)
        glossaryIds.push(entryId)
      }

      const keptQuestionIds = content.questions.flatMap((question) => (question.id === null ? [] : [question.id]))
      await tx.delete(questions).where(and(eq(questions.passageId, id), notInArray(questions.id, keptQuestionIds)))
      if (keptQuestionIds.length > 0) {
        await tx
          .update(questions)
          .set({ orderIndex: sql`-(${questions.orderIndex} + 1)` })
          .where(and(eq(questions.passageId, id), inArray(questions.id, keptQuestionIds)))
      }
      for (const { id: questionId, targetGlossaryIndex, ...values } of content.questions) {
        const targetGlossaryEntryId = targetGlossaryIndex === null ? null : glossaryIds[targetGlossaryIndex] ?? null
        if (questionId === null) {
          await tx.insert(questions).values({ ...values, passageId: id, targetGlossaryEntryId })
          continue
        }
        const rows = await tx
          .update(questions)
          .set({ ...values, targetGlossaryEntryId })
          .where(and(eq(questions.id, questionId), eq(questions.passageId, id)))
          .returning({ id: questions.id })
        if (rows.length === 0) throw new Error(`Question not found: passageId=${id}, id=${questionId}`)
      }
      return true
    })
  }

  /**
   * カーソルの行より後ろの条件。draft は needs_attention DESC, updated_at ASC, id ASC、それ以外は updated_at DESC, id DESC の並び
   */
  private _buildCursorCondition(query: AdminPassageListQuery) {
    const { cursor } = query
    if (!cursor) return undefined
    if (query.status !== "draft") {
      return or(
        lt(passages.updatedAt, cursor.updatedAt),
        and(eq(passages.updatedAt, cursor.updatedAt), lt(passages.id, cursor.id)),
      )
    }
    const isAfterInSameGroup = or(
      gt(passages.updatedAt, cursor.updatedAt),
      and(eq(passages.updatedAt, cursor.updatedAt), gt(passages.id, cursor.id)),
    )
    /**
     * needs_attention は DESC なので、要確認の行の後ろには要確認でない行がすべて続く
     */
    return cursor.needsAttention
      ? or(eq(passages.needsAttention, false), and(eq(passages.needsAttention, true), isAfterInSameGroup))
      : and(eq(passages.needsAttention, false), isAfterInSameGroup)
  }
}
