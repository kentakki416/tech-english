import {
  and,
  asc,
  contentSources,
  count,
  desc,
  DrizzleClient,
  eq,
  exists,
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
  PassageCursor,
  PassageOverview,
  PassageRepository,
  PassageSource,
  PassageTransition,
  PublishedPassageFilter,
  PublishedPassageSummary,
} from "../passage-repository"

/**
 * Drizzleの型
 */
type PassageRow = typeof passages.$inferSelect
type GlossaryEntryRow = typeof passageGlossaryEntries.$inferSelect
type QuestionRow = typeof questions.$inferSelect
type ContentSourceRow = typeof contentSources.$inferSelect
type PassageOverviewRow = Pick<
  PassageRow,
  "id" | "difficulty" | "publishedAt" | "sourceCommitSha" | "sourcePath" | "sourceRetrievedAt" | "timeLimitSeconds" | "title" | "wordCount"
>
type PassageSourceRow = Pick<
  ContentSourceRow,
  "branch" | "fetchType" | "kind" | "licenseSpdx" | "licenseUrl" | "name" | "publicUrlStripPrefix" | "publicUrlTemplate" | "repository" | "siteUrl" | "tags"
>

/**
 * 挑戦の件数（状態を問わない）。passages を FROM に持つクエリの select で使う
 */
const ATTEMPT_COUNT_SQL = sql<number>`(SELECT count(*) FROM ${readingAttempts} WHERE ${readingAttempts.passageId} = ${passages.id})`.mapWith(Number)

/**
 * 設問の数。passages を FROM に持つクエリの select で使う
 */
const QUESTION_COUNT_SQL = sql<number>`(SELECT count(*) FROM ${questions} WHERE ${questions.passageId} = ${passages.id})`.mapWith(Number)

/**
 * ユーザー向けの一覧・概要で読む列（blocks は読まない）。passages → source_documents → content_sources を結合したクエリで使う
 */
const PUBLISHED_SUMMARY_COLUMNS = {
  passage: {
    id: passages.id,
    difficulty: passages.difficulty,
    publishedAt: passages.publishedAt,
    sourceCommitSha: passages.sourceCommitSha,
    sourcePath: passages.sourcePath,
    sourceRetrievedAt: passages.sourceRetrievedAt,
    timeLimitSeconds: passages.timeLimitSeconds,
    title: passages.title,
    wordCount: passages.wordCount,
  },
  questionCount: QUESTION_COUNT_SQL,
  source: {
    branch: contentSources.branch,
    fetchType: contentSources.fetchType,
    kind: contentSources.kind,
    licenseSpdx: contentSources.licenseSpdx,
    licenseUrl: contentSources.licenseUrl,
    name: contentSources.name,
    publicUrlStripPrefix: contentSources.publicUrlStripPrefix,
    publicUrlTemplate: contentSources.publicUrlTemplate,
    repository: contentSources.repository,
    siteUrl: contentSources.siteUrl,
    tags: contentSources.tags,
  },
}

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
 * 公開中の問題の列 → ドメインの型。公開中なら必ずある列が NULL なら throw する
 */
const convertPassageOverviewRowToDomain = (row: PassageOverviewRow): PassageOverview => {
  if (row.difficulty === null || row.publishedAt === null || row.timeLimitSeconds === null) {
    throw new Error(`Invalid published passage: id=${row.id}`)
  }
  return {
    id: row.id,
    difficulty: row.difficulty,
    publishedAt: row.publishedAt,
    sourceCommitSha: row.sourceCommitSha,
    sourcePath: row.sourcePath,
    sourceRetrievedAt: row.sourceRetrievedAt,
    timeLimitSeconds: row.timeLimitSeconds,
    title: row.title,
    wordCount: row.wordCount,
  }
}

/**
 * ソースの列 → ドメインの型。取得方法ごとの必須の列が NULL なら throw する（CHECK 制約で保証している）
 */
const convertPassageSourceRowToDomain = (row: PassageSourceRow): PassageSource => {
  const base = {
    kind: row.kind,
    licenseSpdx: row.licenseSpdx,
    licenseUrl: row.licenseUrl,
    name: row.name,
    tags: row.tags,
  }
  if (row.fetchType === "github_repository") {
    if (row.repository === null || row.branch === null) throw new Error(`Invalid github_repository source: name=${row.name}`)
    return {
      ...base,
      branch: row.branch,
      fetchType: row.fetchType,
      publicUrlStripPrefix: row.publicUrlStripPrefix,
      publicUrlTemplate: row.publicUrlTemplate,
      repository: row.repository,
    }
  }
  if (row.siteUrl === null) throw new Error(`Invalid website source: name=${row.name}`)
  return { ...base, fetchType: row.fetchType, siteUrl: row.siteUrl }
}

/**
 * PUBLISHED_SUMMARY_COLUMNS で読んだ行 → ドメインの型
 */
const convertPublishedSummaryRowToDomain = (row: {
  passage: PassageOverviewRow
  questionCount: number
  source: PassageSourceRow
}): PublishedPassageSummary => ({
  passage: convertPassageOverviewRowToDomain(row.passage),
  questionCount: row.questionCount,
  source: convertPassageSourceRowToDomain(row.source),
})

/**
 * Drizzle 実装の PassageRepository
 */
export class DrizzlePassageRepository implements PassageRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
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

  public async countPublished(filter: PublishedPassageFilter): Promise<number> {
    const [row] = await this._db
      .select({ count: count() })
      .from(passages)
      .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
      .innerJoin(contentSources, eq(sourceDocuments.sourceId, contentSources.id))
      .where(this._buildPublishedCondition(filter))
    return row?.count ?? 0
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

  public async findPublishedById(id: number): Promise<PublishedPassageSummary | null> {
    const [row] = await this._db
      .select(PUBLISHED_SUMMARY_COLUMNS)
      .from(passages)
      .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
      .innerJoin(contentSources, eq(sourceDocuments.sourceId, contentSources.id))
      .where(and(eq(passages.id, id), eq(passages.status, "published")))
    return row ? convertPublishedSummaryRowToDomain(row) : null
  }

  public async findPublishedPage(
    filter: PublishedPassageFilter,
    page: { cursor: PassageCursor | null; limit: number },
  ): Promise<PublishedPassageSummary[]> {
    const { cursor } = page
    const rows = await this._db
      .select(PUBLISHED_SUMMARY_COLUMNS)
      .from(passages)
      .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
      .innerJoin(contentSources, eq(sourceDocuments.sourceId, contentSources.id))
      .where(
        and(
          this._buildPublishedCondition(filter),
          cursor
            ? or(
              lt(passages.publishedAt, cursor.publishedAt),
              and(eq(passages.publishedAt, cursor.publishedAt), lt(passages.id, cursor.id)),
            )
            : undefined,
        ),
      )
      .orderBy(desc(passages.publishedAt), desc(passages.id))
      .limit(page.limit)
    return rows.map(convertPublishedSummaryRowToDomain)
  }

  public async findPublishedTags(): Promise<string[]> {
    const tag = sql<string>`jsonb_array_elements_text(${contentSources.tags})`.as("tag")
    const rows = await this._db
      .selectDistinct({ tag })
      .from(contentSources)
      .where(
        exists(
          this._db
            .select({ id: passages.id })
            .from(passages)
            .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
            .where(and(eq(sourceDocuments.sourceId, contentSources.id), eq(passages.status, "published"))),
        ),
      )
      .orderBy(sql`tag`)
    return rows.map((row) => row.tag)
  }

  public async findRandomPublishedId(filter: PublishedPassageFilter): Promise<number | null> {
    const [row] = await this._db
      .select({ id: passages.id })
      .from(passages)
      .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
      .innerJoin(contentSources, eq(sourceDocuments.sourceId, contentSources.id))
      .where(this._buildPublishedCondition(filter))
      .orderBy(sql`random()`)
      .limit(1)
    return row?.id ?? null
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
        .set({
          attentionReasons: [],
          blocks: row.blocks.map(({ translationJa: _translationJa, ...block }) => block),
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
        })
        .where(eq(passages.id, id))
      return true
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
   * 公開中の問題の絞り込みの条件。passages → source_documents → content_sources を結合したクエリで使う
   */
  private _buildPublishedCondition(filter: PublishedPassageFilter) {
    const { unattemptedByUserId } = filter
    return and(
      eq(passages.status, "published"),
      filter.kind === null ? undefined : eq(contentSources.kind, filter.kind),
      filter.difficulties.length === 0 ? undefined : inArray(passages.difficulty, filter.difficulties),
      /**
       * jsonb の ?| は、配列のどれかの文字列がトップレベルの要素にあれば true
       */
      filter.tags.length === 0
        ? undefined
        : sql`${contentSources.tags} ?| array[${sql.join(filter.tags.map((tag) => sql`${tag}`), sql`, `)}]::text[]`,
      unattemptedByUserId === null
        ? undefined
        : notExists(
          this._db
            .select({ id: readingAttempts.id })
            .from(readingAttempts)
            .where(
              and(
                eq(readingAttempts.passageId, passages.id),
                eq(readingAttempts.userId, unattemptedByUserId),
                eq(readingAttempts.status, "submitted"),
              ),
            ),
        ),
    )
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
