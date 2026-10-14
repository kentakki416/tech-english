import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import { type AttemptAnswer, type AttemptWordLookup, isAttemptStatus, isWordLookupSource, type ReadingAttempt } from "@repo/domain"

import type {
  CreateReadingAttemptInput,
  InsertAttemptAnswerInput,
  InsertAttemptWordLookupInput,
  PassageAttemptSummary,
  ReadingAttemptRepository,
  ReadOptions,
  SubmitReadingAttemptInput,
  WordLookupWithMeaning,
} from "../reading-attempt-repository"
import type { TransactionContext } from "../transaction"

import { resolvePrismaClient } from "./transaction-runner"

/**
 * Prismaの型
 */
type ReadingAttemptRow = PrismaTypes.ReadingAttemptGetPayload<{}>
type AttemptAnswerRow = PrismaTypes.AttemptAnswerGetPayload<{}>
type AttemptWordLookupRow = PrismaTypes.AttemptWordLookupGetPayload<{}>

/**
 * Prismaの型 → ドメインの型。status は domain の判定関数で検証し、study_date（UTC の 0 時の Date）は YYYY-MM-DD に戻す
 */
const convertReadingAttemptRowToDomain = (row: ReadingAttemptRow): ReadingAttempt => {
  if (!isAttemptStatus(row.status)) throw new Error(`Invalid attempt status: id=${row.id}, status=${row.status}`)
  return {
    id: row.id,
    correctCount: row.correctCount,
    elapsedSeconds: row.elapsedSeconds,
    isOvertime: row.isOvertime,
    listenedBlockCount: row.listenedBlockCount,
    passageId: row.passageId,
    questionCount: row.questionCount,
    startedAt: row.startedAt,
    status: row.status,
    studyDate: row.studyDate === null ? null : row.studyDate.toISOString().slice(0, 10),
    submittedAt: row.submittedAt,
    timeLimitSeconds: row.timeLimitSeconds,
    translatedBlockCount: row.translatedBlockCount,
    userId: row.userId,
    wordLookupCount: row.wordLookupCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const convertAttemptAnswerRowToDomain = (row: AttemptAnswerRow): AttemptAnswer => ({
  id: row.id,
  attemptId: row.attemptId,
  isCorrect: row.isCorrect,
  questionId: row.questionId,
  selectedChoiceIndex: row.selectedChoiceIndex,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * source は domain の判定関数で検証する
 */
const convertAttemptWordLookupRowToDomain = (row: AttemptWordLookupRow): AttemptWordLookup => {
  if (!isWordLookupSource(row.source)) throw new Error(`Invalid word lookup source: id=${row.id}, source=${row.source}`)
  return {
    id: row.id,
    attemptId: row.attemptId,
    glossaryEntryId: row.glossaryEntryId,
    lemma: row.lemma,
    passageId: row.passageId,
    source: row.source,
    surface: row.surface,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * YYYY-MM-DD → Prisma の date 列に入れる Date（UTC の 0 時）
 */
const convertStudyDateToPrisma = (studyDate: string): Date => new Date(`${studyDate}T00:00:00.000Z`)

/**
 * 更新・削除の対象が無い（Prisma のエラーコード P2025）か
 */
const isRecordNotFoundError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2025"

/**
 * 一意制約違反（Prisma のエラーコード P2002）か。`Prisma` は型だけの export なので instanceof は使わずに code を見る
 */
const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002"

/**
 * Prisma 実装の ReadingAttemptRepository
 */
export class PrismaReadingAttemptRepository implements ReadingAttemptRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  /**
   * Prisma は部分 unique index を ON CONFLICT の対象にできないので、insert の一意制約違反を null に変換する
   */
  public async createInProgress(input: CreateReadingAttemptInput): Promise<ReadingAttempt | null> {
    try {
      const row = await this._prisma.readingAttempt.create({
        data: {
          passageId: input.passageId,
          startedAt: input.startedAt,
          status: "in_progress",
          timeLimitSeconds: input.timeLimitSeconds,
          userId: input.userId,
        },
      })
      return convertReadingAttemptRowToDomain(row)
    } catch (error) {
      if (isUniqueConstraintError(error)) return null
      throw error
    }
  }

  public async expireStale(userId: number, aliveSince: Date): Promise<number> {
    const result = await this._prisma.readingAttempt.updateMany({
      data: { status: "expired" },
      where: { startedAt: { lte: aliveSince }, status: "in_progress", userId },
    })
    return result.count
  }

  public async findAliveInProgress(
    userId: number,
    passageId: number,
    aliveSince: Date,
    options?: ReadOptions,
  ): Promise<ReadingAttempt | null> {
    const row = await this._read(options, async (client) =>
      client.readingAttempt.findFirst({ where: { passageId, startedAt: { gt: aliveSince }, status: "in_progress", userId } }))
    return row ? convertReadingAttemptRowToDomain(row) : null
  }

  public async findAnswersByAttemptId(attemptId: number, options?: ReadOptions): Promise<AttemptAnswer[]> {
    const rows = await this._read(options, async (client) =>
      client.attemptAnswer.findMany({ orderBy: { id: "asc" }, where: { attemptId } }))
    return rows.map(convertAttemptAnswerRowToDomain)
  }

  public async findByIdForUser(id: number, userId: number, options?: ReadOptions): Promise<ReadingAttempt | null> {
    const row = await this._read(options, async (client) => client.readingAttempt.findFirst({ where: { id, userId } }))
    return row ? convertReadingAttemptRowToDomain(row) : null
  }

  /**
   * attempt_word_lookups には dictionary_entries へのリレーションが無いので、辞書の意味は見出し語で別に読んで突き合わせる
   */
  public async findWordLookupsWithMeaning(attemptId: number, options?: ReadOptions): Promise<WordLookupWithMeaning[]> {
    return this._read(options, async (client) => {
      const rows = await client.attemptWordLookup.findMany({
        include: { glossaryEntry: { select: { meaningJa: true } } },
        orderBy: { id: "asc" },
        where: { attemptId },
      })
      const dictionaryLemmas = [...new Set(rows.filter((row) => row.source === "dictionary").map((row) => row.lemma))]
      const dictionaryRows = dictionaryLemmas.length === 0
        ? []
        : await client.dictionaryEntry.findMany({
          select: { headword: true, meaningJa: true },
          where: { headword: { in: dictionaryLemmas } },
        })
      const meaningByHeadword = new Map(dictionaryRows.map((row) => [row.headword, row.meaningJa]))
      return rows.map(({ glossaryEntry, ...row }) => ({
        ...convertAttemptWordLookupRowToDomain(row),
        meaningJa: row.source === "glossary" ? glossaryEntry?.meaningJa ?? null : meaningByHeadword.get(row.lemma) ?? null,
      }))
    })
  }

  public async insertAnswers(answers: InsertAttemptAnswerInput[], tx?: TransactionContext): Promise<void> {
    if (answers.length === 0) return
    const client = resolvePrismaClient(this._prisma, tx)
    await client.attemptAnswer.createMany({
      data: answers.map((answer) => ({
        attemptId: answer.attemptId,
        isCorrect: answer.isCorrect,
        questionId: answer.questionId,
        selectedChoiceIndex: answer.selectedChoiceIndex,
      })),
    })
  }

  public async insertWordLookups(lookups: InsertAttemptWordLookupInput[], tx?: TransactionContext): Promise<void> {
    if (lookups.length === 0) return
    const client = resolvePrismaClient(this._prisma, tx)
    await client.attemptWordLookup.createMany({
      data: lookups.map((lookup) => ({
        attemptId: lookup.attemptId,
        glossaryEntryId: lookup.glossaryEntryId,
        lemma: lookup.lemma,
        passageId: lookup.passageId,
        source: lookup.source,
        surface: lookup.surface,
        userId: lookup.userId,
      })),
    })
  }

  /**
   * update の where に status の条件を足し、当てはまらない（P2025）ときは null にする
   */
  public async markSubmitted(input: SubmitReadingAttemptInput, tx?: TransactionContext): Promise<ReadingAttempt | null> {
    const client = resolvePrismaClient(this._prisma, tx)
    try {
      const row = await client.readingAttempt.update({
        data: {
          correctCount: input.correctCount,
          elapsedSeconds: input.elapsedSeconds,
          isOvertime: input.isOvertime,
          listenedBlockCount: input.listenedBlockCount,
          questionCount: input.questionCount,
          status: "submitted",
          studyDate: convertStudyDateToPrisma(input.studyDate),
          submittedAt: input.submittedAt,
          translatedBlockCount: input.translatedBlockCount,
          wordLookupCount: input.wordLookupCount,
        },
        where: { id: input.attemptId, status: "in_progress" },
      })
      return convertReadingAttemptRowToDomain(row)
    } catch (error) {
      if (isRecordNotFoundError(error)) return null
      throw error
    }
  }

  /**
   * Prisma の groupBy は集計ごとに条件を変えられないので、提出済みの集計と期限内の挑戦中を別に読んで passageId で突き合わせる
   */
  public async summarizeByPassageIds(userId: number, passageIds: number[], aliveSince: Date): Promise<PassageAttemptSummary[]> {
    if (passageIds.length === 0) return []
    const [submittedGroups, inProgressRows] = await Promise.all([
      this._prisma.readingAttempt.groupBy({
        _count: { _all: true },
        _max: { correctCount: true },
        by: ["passageId"],
        where: { passageId: { in: passageIds }, status: "submitted", userId },
      }),
      this._prisma.readingAttempt.findMany({
        select: { id: true, passageId: true },
        where: { passageId: { in: passageIds }, startedAt: { gt: aliveSince }, status: "in_progress", userId },
      }),
    ])
    const summaries = new Map<number, PassageAttemptSummary>()
    for (const group of submittedGroups) {
      summaries.set(group.passageId, {
        attemptCount: group._count._all,
        bestCorrectCount: group._max.correctCount,
        inProgressAttemptId: null,
        passageId: group.passageId,
      })
    }
    for (const row of inProgressRows) {
      const summary = summaries.get(row.passageId) ?? {
        attemptCount: 0,
        bestCorrectCount: null,
        inProgressAttemptId: null,
        passageId: row.passageId,
      }
      summaries.set(row.passageId, { ...summary, inProgressAttemptId: Math.max(summary.inProgressAttemptId ?? row.id, row.id) })
    }
    return [...summaries.values()].sort((left, right) => left.passageId - right.passageId)
  }

  /**
   * fromPrimary なら read replica の遅れを避けて $transaction（primary に流れる）の中で読む（findAdminDetail と同じ）。
   * 1 つのトランザクションの接続で並行に読まないよう、fn の中のクエリは順に実行する
   */
  private async _read<T>(options: ReadOptions | undefined, fn: (client: PrismaTypes.TransactionClient) => Promise<T>): Promise<T> {
    return options?.fromPrimary ? this._prisma.$transaction(fn) : fn(this._prisma)
  }
}
