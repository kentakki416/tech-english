import { z } from "zod"

import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import {
  type GlossaryEntry,
  isPassageDifficulty,
  isPassageStatus,
  isQuestionType,
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
  DraftEditContent,
  PassageRepository,
  PassageTransition,
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
 * 一覧で読む関連（挑戦・設問の件数とソース）
 */
const LIST_INCLUDE = {
  _count: { select: { questions: true, readingAttempts: true } },
  sourceDocument: { select: { source: { select: { id: true, name: true } } } },
} satisfies PrismaTypes.PassageInclude

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

  public async countByStatus(): Promise<Record<PassageStatus, number>> {
    const groups = await this._prisma.passage.groupBy({ _count: { _all: true }, by: ["status"] })
    const counts = Object.fromEntries(PASSAGE_STATUSES.map((status) => [status, 0])) as Record<PassageStatus, number>
    for (const group of groups) {
      if (!isPassageStatus(group.status)) throw new Error(`Invalid passage status: ${group.status}`)
      counts[group.status] = group._count._all
    }
    return counts
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

      const blocks: PassageBlock[] = passageBlocksSchema
        .parse(row.blocks)
        .map(({ translationJa: _translationJa, ...block }) => block)
      await tx.question.deleteMany({ where: { passageId: id } })
      await tx.passageGlossaryEntry.deleteMany({ where: { passageId: id } })
      await tx.passage.update({
        data: {
          attentionReasons: [],
          blocks,
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
        },
        where: { id },
      })
      return true
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
