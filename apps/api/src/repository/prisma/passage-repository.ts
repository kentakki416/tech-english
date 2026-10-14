import { z } from "zod"

import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import {
  type GlossaryEntry,
  isAllowedLicense,
  isPassageDifficulty,
  isPassageStatus,
  isQuestionType,
  isSourceFetchType,
  isSourceKind,
  type Passage,
  PASSAGE_BLOCK_TYPES,
  PASSAGE_STATUSES,
  type PassageBlock,
  type PassageStatus,
  type Question,
} from "@repo/domain"

import type {
  AdminPassageDetail,
  AdminPassageListItem,
  AdminPassageListQuery,
  AttemptContent,
  DraftEditContent,
  PassageCursor,
  PassageRepository,
  PassageSource,
  PassageTransition,
  PublishedPassageFilter,
  PublishedPassageSummary,
  RestoredPassageStatus,
} from "../passage-repository"

/**
 * Prismaの型
 */
type PassageRow = PrismaTypes.PassageGetPayload<{}>
type GlossaryEntryRow = PrismaTypes.PassageGlossaryEntryGetPayload<{}>
type QuestionRow = PrismaTypes.QuestionGetPayload<{}>

/**
 * jsonb の PassageBlock[] 列
 */
const passageBlocksSchema = z.array(
  z.object({
    lang: z.string().optional(),
    text: z.string(),
    translationJa: z.string().optional(),
    type: z.enum(PASSAGE_BLOCK_TYPES),
  }),
)

/**
 * jsonb の string[] 列
 */
const stringListSchema = z.array(z.string())

/**
 * 生成待ち（collected）に戻すときに書く値。Drizzle 実装の RESET_TO_COLLECTED_VALUES と同じ（和訳は blocks から別に外す）
 */
const RESET_TO_COLLECTED_DATA = {
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
} satisfies PrismaTypes.PassageUpdateInput

/**
 * jsonb の blocks を読み、和訳を外す（collected に戻すとき）
 */
const parseBlocksWithoutTranslations = (blocks: unknown): PassageBlock[] =>
  passageBlocksSchema.parse(blocks).map(({ translationJa: _translationJa, ...block }) => block)

/**
 * 一覧で読む関連（挑戦・設問の件数とソース）
 */
const LIST_INCLUDE = {
  _count: { select: { questions: true, readingAttempts: true } },
  sourceDocument: { select: { source: { select: { id: true, name: true } } } },
} satisfies PrismaTypes.PassageInclude

/**
 * 出典と一覧の表示に使うソースの列
 */
const PASSAGE_SOURCE_SELECT = {
  branch: true,
  fetchType: true,
  kind: true,
  licenseSpdx: true,
  licenseUrl: true,
  name: true,
  publicUrlStripPrefix: true,
  publicUrlTemplate: true,
  repository: true,
  siteUrl: true,
  tags: true,
} satisfies PrismaTypes.ContentSourceSelect

/**
 * ユーザー向けの一覧・概要で読む列（blocks は読まない）
 */
const PUBLISHED_SUMMARY_SELECT = {
  _count: { select: { questions: true } },
  id: true,
  difficulty: true,
  publishedAt: true,
  sourceCommitSha: true,
  sourceDocument: { select: { source: { select: PASSAGE_SOURCE_SELECT } } },
  sourcePath: true,
  sourceRetrievedAt: true,
  timeLimitSeconds: true,
  title: true,
  wordCount: true,
} satisfies PrismaTypes.PassageSelect

type PublishedSummaryRow = PrismaTypes.PassageGetPayload<{ select: typeof PUBLISHED_SUMMARY_SELECT }>
type PassageSourceRow = PublishedSummaryRow["sourceDocument"]["source"]

/**
 * Prismaの型 → ドメインの型。Prisma は CHECK 制約の値の集合を型に持たないので、domain の判定関数で検証する。jsonb は配列に戻す
 */
const convertPassageRowToDomain = (row: PassageRow): Passage => {
  if (!isPassageStatus(row.status)) throw new Error(`Invalid passage status: id=${row.id}, status=${row.status}`)
  const { difficulty } = row
  if (difficulty !== null && !isPassageDifficulty(difficulty)) {
    throw new Error(`Invalid passage difficulty: id=${row.id}, difficulty=${difficulty}`)
  }
  return {
    id: row.id,
    attentionReasons: stringListSchema.parse(row.attentionReasons),
    blocks: passageBlocksSchema.parse(row.blocks),
    contentHash: row.contentHash,
    difficulty,
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
  }
}

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

const convertQuestionRowToDomain = (row: QuestionRow): Question => {
  if (!isQuestionType(row.type)) throw new Error(`Invalid question type: id=${row.id}, type=${row.type}`)
  return {
    id: row.id,
    choices: stringListSchema.parse(row.choices),
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
  }
}

/**
 * ソースの列 → ドメインの型。Prisma は CHECK 制約の値の集合を型に持たないので、domain の判定関数で検証する
 */
const convertPassageSourceRowToDomain = (row: PassageSourceRow): PassageSource => {
  if (!isSourceKind(row.kind)) throw new Error(`Invalid source kind: name=${row.name}, kind=${row.kind}`)
  if (!isAllowedLicense(row.licenseSpdx)) throw new Error(`Invalid license: name=${row.name}, licenseSpdx=${row.licenseSpdx}`)
  if (!isSourceFetchType(row.fetchType)) throw new Error(`Invalid fetch type: name=${row.name}, fetchType=${row.fetchType}`)
  const base = {
    kind: row.kind,
    licenseSpdx: row.licenseSpdx,
    licenseUrl: row.licenseUrl,
    name: row.name,
    tags: stringListSchema.parse(row.tags),
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
 * 公開中の問題の行 → ドメインの型。公開中なら必ずある列が NULL なら throw する
 */
const convertPublishedSummaryRowToDomain = (row: PublishedSummaryRow): PublishedPassageSummary => {
  const { difficulty, publishedAt, timeLimitSeconds } = row
  if (difficulty === null || !isPassageDifficulty(difficulty) || publishedAt === null || timeLimitSeconds === null) {
    throw new Error(`Invalid published passage: id=${row.id}`)
  }
  return {
    passage: {
      id: row.id,
      difficulty,
      publishedAt,
      sourceCommitSha: row.sourceCommitSha,
      sourcePath: row.sourcePath,
      sourceRetrievedAt: row.sourceRetrievedAt,
      timeLimitSeconds,
      title: row.title,
      wordCount: row.wordCount,
    },
    questionCount: row._count.questions,
    source: convertPassageSourceRowToDomain(row.sourceDocument.source),
  }
}

/**
 * 公開中の問題の絞り込みの条件。Drizzle 実装の _buildPublishedCondition と同じ
 */
const buildPublishedWhere = (filter: PublishedPassageFilter): PrismaTypes.PassageWhereInput => ({
  AND: [
    { status: "published" },
    filter.kind === null ? {} : { sourceDocument: { source: { kind: filter.kind } } },
    filter.difficulties.length === 0 ? {} : { difficulty: { in: filter.difficulties } },
    filter.tags.length === 0
      ? {}
      : { OR: filter.tags.map((tag) => ({ sourceDocument: { source: { tags: { array_contains: [tag] } } } })) },
    filter.unattemptedByUserId === null
      ? {}
      : { readingAttempts: { none: { status: "submitted", userId: filter.unattemptedByUserId } } },
  ],
})

/**
 * ユーザー向けの一覧のカーソルの行より後ろの条件（published_at DESC, id DESC の並び）
 */
const buildPublishedCursorWhere = (cursor: PassageCursor | null): PrismaTypes.PassageWhereInput => {
  if (!cursor) return {}
  return {
    OR: [
      { publishedAt: { lt: cursor.publishedAt } },
      { id: { lt: cursor.id }, publishedAt: cursor.publishedAt },
    ],
  }
}

/**
 * カーソルの行より後ろの条件。Drizzle 実装の _buildCursorCondition と同じ（Prisma の boolean は lt を持たないので場合分けする）
 */
const buildCursorWhere = (query: AdminPassageListQuery): PrismaTypes.PassageWhereInput => {
  const { cursor } = query
  if (!cursor) return {}
  if (query.status !== "draft") {
    return {
      OR: [
        { updatedAt: { lt: cursor.updatedAt } },
        { id: { lt: cursor.id }, updatedAt: cursor.updatedAt },
      ],
    }
  }
  const isAfterInSameGroup: PrismaTypes.PassageWhereInput = {
    OR: [
      { updatedAt: { gt: cursor.updatedAt } },
      { id: { gt: cursor.id }, updatedAt: cursor.updatedAt },
    ],
  }
  return cursor.needsAttention
    ? { OR: [{ needsAttention: false }, { AND: [{ needsAttention: true }, isAfterInSameGroup] }] }
    : { AND: [{ needsAttention: false }, isAfterInSameGroup] }
}

/**
 * Prisma 実装の PassageRepository
 */
export class PrismaPassageRepository implements PassageRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async clearAttention(id: number): Promise<boolean> {
    const result = await this._prisma.passage.updateMany({ data: { attentionReasons: [], needsAttention: false }, where: { id } })
    return result.count > 0
  }

  public async countByStatus(): Promise<Record<PassageStatus, number>> {
    const groups = await this._prisma.passage.groupBy({ _count: { _all: true }, by: ["status"] })
    const counts = Object.fromEntries(PASSAGE_STATUSES.map((status) => [status, 0])) as Record<PassageStatus, number>
    for (const group of groups) {
      if (!isPassageStatus(group.status)) throw new Error(`Invalid passage status: ${group.status}`)
      counts[group.status] = group._count._all
    }
    return counts
  }

  public async countPublished(filter: PublishedPassageFilter): Promise<number> {
    return this._prisma.passage.count({ where: buildPublishedWhere(filter) })
  }

  /**
   * 保存・状態の遷移の前の検査と、保存した直後の再取得に使うので、read replica の遅延を避けて
   * $transaction（primary に流れる）の中で読む。1 つのトランザクションの接続で関連を並行に読まないよう、クエリを分けて順に読む
   */
  public async findAdminDetail(id: number): Promise<AdminPassageDetail | null> {
    return this._prisma.$transaction(async (tx) => {
      const passage = await tx.passage.findUnique({ where: { id } })
      if (!passage) return null
      const sourceDocument = await tx.sourceDocument.findUniqueOrThrow({
        select: { source: { select: { id: true, name: true } } },
        where: { id: passage.sourceDocumentId },
      })
      const glossaryRows = await tx.passageGlossaryEntry.findMany({
        orderBy: [{ blockIndex: "asc" }, { startOffset: "asc" }, { id: "asc" }],
        where: { passageId: id },
      })
      const questionRows = await tx.question.findMany({ orderBy: { orderIndex: "asc" }, where: { passageId: id } })
      const attemptCount = await tx.readingAttempt.count({ where: { passageId: id } })
      return {
        attemptCount,
        glossary: glossaryRows.map(convertGlossaryEntryRowToDomain),
        passage: convertPassageRowToDomain(passage),
        questions: questionRows.map(convertQuestionRowToDomain),
        source: sourceDocument.source,
      }
    })
  }

  public async findAdminList(query: AdminPassageListQuery): Promise<AdminPassageListItem[]> {
    const rows = await this._prisma.passage.findMany({
      include: LIST_INCLUDE,
      orderBy: query.status === "draft"
        ? [{ needsAttention: "desc" }, { updatedAt: "asc" }, { id: "asc" }]
        : [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      where: {
        AND: [
          { status: query.status },
          query.sourceId === undefined ? {} : { sourceDocument: { sourceId: query.sourceId } },
          query.needsAttention === undefined ? {} : { needsAttention: query.needsAttention },
          buildCursorWhere(query),
        ],
      },
    })
    return rows.map(({ _count: relationCounts, sourceDocument, ...passage }) => ({
      attemptCount: relationCounts.readingAttempts,
      passage: convertPassageRowToDomain(passage),
      questionCount: relationCounts.questions,
      source: sourceDocument.source,
    }))
  }

  public async findAttemptContentById(passageId: number): Promise<AttemptContent | null> {
    const row = await this._prisma.passage.findUnique({
      include: {
        glossaryEntries: { orderBy: [{ blockIndex: "asc" }, { startOffset: "asc" }, { id: "asc" }] },
        questions: { orderBy: { orderIndex: "asc" } },
        sourceDocument: { select: { source: { select: PASSAGE_SOURCE_SELECT } } },
      },
      where: { id: passageId },
    })
    if (!row) return null
    const { glossaryEntries, questions, sourceDocument, ...passage } = row
    return {
      glossary: glossaryEntries.map(convertGlossaryEntryRowToDomain),
      passage: convertPassageRowToDomain(passage),
      questions: questions.map(convertQuestionRowToDomain),
      source: convertPassageSourceRowToDomain(sourceDocument.source),
    }
  }

  public async findPublishedById(id: number): Promise<PublishedPassageSummary | null> {
    const row = await this._prisma.passage.findFirst({ select: PUBLISHED_SUMMARY_SELECT, where: { id, status: "published" } })
    return row ? convertPublishedSummaryRowToDomain(row) : null
  }

  public async findPublishedPage(
    filter: PublishedPassageFilter,
    page: { cursor: PassageCursor | null; limit: number },
  ): Promise<PublishedPassageSummary[]> {
    const rows = await this._prisma.passage.findMany({
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      select: PUBLISHED_SUMMARY_SELECT,
      take: page.limit,
      where: { AND: [buildPublishedWhere(filter), buildPublishedCursorWhere(page.cursor)] },
    })
    return rows.map(convertPublishedSummaryRowToDomain)
  }

  /**
   * Prisma には jsonb の配列を行に展開する API が無いので、Drizzle 実装と同じ SQL を $queryRaw で書く（並びの照合順序も揃う）
   */
  public async findPublishedTags(): Promise<string[]> {
    const rows = await this._prisma.$queryRaw<{ tag: string }[]>`
      SELECT DISTINCT jsonb_array_elements_text(content_sources.tags) AS tag
      FROM content_sources
      WHERE EXISTS (
        SELECT 1 FROM passages
        INNER JOIN source_documents ON passages.source_document_id = source_documents.id
        WHERE source_documents.source_id = content_sources.id AND passages.status = 'published'
      )
      ORDER BY tag
    `
    return rows.map((row) => row.tag)
  }

  /**
   * 当てはまる問題の id をすべて読んで JS で選ぶ（公開中の問題が少ないうちはこれでよい）
   */
  public async findRandomPublishedId(filter: PublishedPassageFilter): Promise<number | null> {
    const rows = await this._prisma.passage.findMany({ select: { id: true }, where: buildPublishedWhere(filter) })
    if (rows.length === 0) return null
    return rows[Math.floor(Math.random() * rows.length)]?.id ?? null
  }

  /**
   * Prisma には行ロックつきの select が無いので、状態と挑戦の有無の確認とロックは Drizzle 実装と同じ SQL を $queryRaw で書く
   */
  public async resetForRegeneration(id: number, from: PassageStatus[]): Promise<boolean> {
    return this._prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ blocks: unknown }[]>`
        SELECT blocks FROM passages
        WHERE id = ${id}::integer
          AND status = ANY(${from}::text[])
          AND NOT EXISTS (SELECT 1 FROM reading_attempts WHERE reading_attempts.passage_id = passages.id)
        FOR UPDATE
      `
      if (!row) return false

      await tx.question.deleteMany({ where: { passageId: id } })
      await tx.passageGlossaryEntry.deleteMany({ where: { passageId: id } })
      await tx.passage.update({
        data: { ...RESET_TO_COLLECTED_DATA, blocks: parseBlocksWithoutTranslations(row.blocks) },
        where: { id },
      })
      return true
    })
  }

  /**
   * Drizzle 実装と同じ手順。行ロックつきの select は $queryRaw で書く
   */
  public async restoreRejected(id: number): Promise<RestoredPassageStatus | null> {
    return this._prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ blocks: unknown }[]>`
        SELECT blocks FROM passages WHERE id = ${id}::integer AND status = 'rejected' FOR UPDATE
      `
      if (!row) return null

      const question = await tx.question.findFirst({ select: { id: true }, where: { passageId: id } })
      if (question) {
        await tx.passage.update({ data: { rejectReason: null, status: "draft" }, where: { id } })
        return "draft"
      }

      await tx.passageGlossaryEntry.deleteMany({ where: { passageId: id } })
      await tx.passage.update({
        data: { ...RESET_TO_COLLECTED_DATA, blocks: parseBlocksWithoutTranslations(row.blocks) },
        where: { id },
      })
      return "collected"
    })
  }

  public async transitionStatus(id: number, transition: PassageTransition): Promise<boolean> {
    const result = await this._prisma.passage.updateMany({
      data: {
        ...(transition.publishedAt === undefined ? {} : { publishedAt: transition.publishedAt }),
        ...(transition.rejectReason === undefined ? {} : { rejectReason: transition.rejectReason }),
        ...(transition.reviewedAt === undefined ? {} : { reviewedAt: transition.reviewedAt }),
        status: transition.to,
      },
      where: { id, status: { in: transition.from } },
    })
    return result.count > 0
  }

  /**
   * Drizzle 実装と同じ手順を $transaction の中で行う。残す設問の order_index の退避は、行ごとに -(残す設問の中での順 + 1) を入れる
   * （互いに重ならない負の値なら (passage_id, order_index) の unique 違反にならない）
   */
  public async updateDraftContent(id: number, content: DraftEditContent): Promise<boolean> {
    return this._prisma.$transaction(async (tx) => {
      const updated = await tx.passage.updateMany({
        data: {
          blocks: content.blocks,
          difficulty: content.difficulty,
          timeLimitSeconds: content.timeLimitSeconds,
          title: content.title,
        },
        where: { id, status: "draft" },
      })
      if (updated.count === 0) return false

      const keptGlossaryIds = content.glossary.flatMap((entry) => (entry.id === null ? [] : [entry.id]))
      await tx.passageGlossaryEntry.deleteMany({ where: { id: { notIn: keptGlossaryIds }, passageId: id } })
      const glossaryIds: number[] = []
      for (const { id: entryId, ...values } of content.glossary) {
        if (entryId === null) {
          const created = await tx.passageGlossaryEntry.create({ data: { ...values, passageId: id }, select: { id: true } })
          glossaryIds.push(created.id)
          continue
        }
        const result = await tx.passageGlossaryEntry.updateMany({ data: values, where: { id: entryId, passageId: id } })
        if (result.count === 0) throw new Error(`Glossary entry not found: passageId=${id}, id=${entryId}`)
        glossaryIds.push(entryId)
      }

      const keptQuestionIds = content.questions.flatMap((question) => (question.id === null ? [] : [question.id]))
      await tx.question.deleteMany({ where: { id: { notIn: keptQuestionIds }, passageId: id } })
      for (const [index, questionId] of keptQuestionIds.entries()) {
        await tx.question.updateMany({ data: { orderIndex: -(index + 1) }, where: { id: questionId, passageId: id } })
      }
      for (const { id: questionId, targetGlossaryIndex, ...values } of content.questions) {
        const targetGlossaryEntryId = targetGlossaryIndex === null ? null : glossaryIds[targetGlossaryIndex] ?? null
        if (questionId === null) {
          await tx.question.create({ data: { ...values, passageId: id, targetGlossaryEntryId } })
          continue
        }
        const result = await tx.question.updateMany({
          data: { ...values, targetGlossaryEntryId },
          where: { id: questionId, passageId: id },
        })
        if (result.count === 0) throw new Error(`Question not found: passageId=${id}, id=${questionId}`)
      }
      return true
    })
  }
}
