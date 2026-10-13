import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import { isQuestionType } from "@repo/domain"

import type {
  AccuracyCount,
  DailyStudySummary,
  FindSubmittedAttemptsOptions,
  LearningRecordRepository,
  QuestionTypeAccuracyCount,
  StudyTotals,
  SubmittedAttempt,
} from "../learning-record-repository"

/**
 * $queryRaw の結果。count(*) は bigint で返る
 */
type QuestionTypeAccuracyQueryRow = { correct_count: bigint; question_count: bigint; type: string }

/**
 * findSubmittedAttempts が読む挑戦の行（問題のタイトルつき）
 */
type SubmittedAttemptRow = PrismaTypes.ReadingAttemptGetPayload<{ include: { passage: { select: { title: true } } } }>

/**
 * YYYY-MM-DD → Prisma の date 列に入れる Date（UTC の 0 時）
 */
const convertDateToPrisma = (date: string): Date => new Date(`${date}T00:00:00.000Z`)

/**
 * Prisma の date 列（UTC の 0 時の Date）→ YYYY-MM-DD
 */
const convertPrismaDateToString = (date: Date): string => date.toISOString().slice(0, 10)

/**
 * submitted の行は CHECK 制約（reading_attempts_submitted_columns_check）で採点結果と時間が必ずある。
 * 型の上では NULL になりうるので、ここで確かめてから非 NULL の型にする
 */
const requireSubmittedValue = <T>(value: T | null, column: string, attemptId: number): T => {
  if (value === null) throw new Error(`Submitted attempt has null ${column}: id=${attemptId}`)
  return value
}

const convertSubmittedAttemptRowToDomain = (row: SubmittedAttemptRow): SubmittedAttempt => ({
  id: row.id,
  correctCount: requireSubmittedValue(row.correctCount, "correct_count", row.id),
  elapsedSeconds: requireSubmittedValue(row.elapsedSeconds, "elapsed_seconds", row.id),
  isOvertime: requireSubmittedValue(row.isOvertime, "is_overtime", row.id),
  passageId: row.passageId,
  passageTitle: row.passage.title,
  questionCount: requireSubmittedValue(row.questionCount, "question_count", row.id),
  studyDate: convertPrismaDateToString(requireSubmittedValue(row.studyDate, "study_date", row.id)),
  submittedAt: requireSubmittedValue(row.submittedAt, "submitted_at", row.id),
  translatedBlockCount: row.translatedBlockCount,
  wordLookupCount: row.wordLookupCount,
})

/**
 * Prisma 実装の LearningRecordRepository
 */
export class PrismaLearningRecordRepository implements LearningRecordRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findStudyDates(userId: number): Promise<string[]> {
    const rows = await this._prisma.readingAttempt.findMany({
      distinct: ["studyDate"],
      orderBy: { studyDate: "asc" },
      select: { studyDate: true },
      where: { status: "submitted", studyDate: { not: null }, userId },
    })
    return rows.flatMap((row) => (row.studyDate === null ? [] : [convertPrismaDateToString(row.studyDate)]))
  }

  /**
   * Prisma は行の比較を書けないので、cursor の挑戦の (submitted_at, id) を先に読み、
   * 「submitted_at が前」か「submitted_at が同じで id が小さい」を OR でつなぐ
   */
  public async findSubmittedAttempts(userId: number, options: FindSubmittedAttemptsOptions): Promise<SubmittedAttempt[]> {
    let cursorCondition: PrismaTypes.ReadingAttemptWhereInput = {}
    if (options.cursor !== undefined) {
      const cursorAttempt = await this._prisma.readingAttempt.findFirst({
        select: { id: true, submittedAt: true },
        where: { id: options.cursor, userId },
      })
      if (!cursorAttempt?.submittedAt) return []
      cursorCondition = {
        OR: [
          { submittedAt: { lt: cursorAttempt.submittedAt } },
          { id: { lt: cursorAttempt.id }, submittedAt: cursorAttempt.submittedAt },
        ],
      }
    }
    const rows = await this._prisma.readingAttempt.findMany({
      include: { passage: { select: { title: true } } },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: options.limit,
      where: {
        ...cursorCondition,
        status: "submitted",
        studyDate: options.date === undefined ? undefined : convertDateToPrisma(options.date),
        userId,
      },
    })
    return rows.map(convertSubmittedAttemptRowToDomain)
  }

  /**
   * Prisma の groupBy は関連先（questions）の列でまとめられないため、Drizzle 実装と同じ SQL を書く
   */
  public async summarizeAccuracyByQuestionType(userId: number): Promise<QuestionTypeAccuracyCount[]> {
    const rows = await this._prisma.$queryRaw<QuestionTypeAccuracyQueryRow[]>`
      SELECT
        questions.type,
        count(*) FILTER (WHERE attempt_answers.is_correct) AS correct_count,
        count(*) AS question_count
      FROM attempt_answers
      INNER JOIN reading_attempts ON reading_attempts.id = attempt_answers.attempt_id
      INNER JOIN questions ON questions.id = attempt_answers.question_id
      WHERE reading_attempts.user_id = ${userId} AND reading_attempts.status = 'submitted'
      GROUP BY questions.type
      ORDER BY questions.type
    `
    return rows.map((row) => {
      if (!isQuestionType(row.type)) throw new Error(`Invalid question type: ${row.type}`)
      return { correctCount: Number(row.correct_count), questionCount: Number(row.question_count), type: row.type }
    })
  }

  public async summarizeByDate(userId: number, range: { from: string; to: string }): Promise<DailyStudySummary[]> {
    const groups = await this._prisma.readingAttempt.groupBy({
      _count: { _all: true },
      _sum: { correctCount: true, elapsedSeconds: true, questionCount: true },
      by: ["studyDate"],
      orderBy: { studyDate: "asc" },
      where: {
        status: "submitted",
        studyDate: { gte: convertDateToPrisma(range.from), lte: convertDateToPrisma(range.to) },
        userId,
      },
    })
    return groups.flatMap((group) =>
      group.studyDate === null
        ? []
        : [
          {
            attemptCount: group._count._all,
            correctCount: group._sum.correctCount ?? 0,
            date: convertPrismaDateToString(group.studyDate),
            questionCount: group._sum.questionCount ?? 0,
            studySeconds: group._sum.elapsedSeconds ?? 0,
          },
        ])
  }

  public async summarizeNoAssistAccuracy(userId: number): Promise<AccuracyCount> {
    const result = await this._prisma.readingAttempt.aggregate({
      _sum: { correctCount: true, questionCount: true },
      where: { status: "submitted", translatedBlockCount: 0, userId, wordLookupCount: 0 },
    })
    return { correctCount: result._sum.correctCount ?? 0, questionCount: result._sum.questionCount ?? 0 }
  }

  /**
   * Prisma の aggregate は count(DISTINCT) を持たないので、解いた問題の数は passage_id の distinct で別に数える
   */
  public async summarizeTotals(userId: number): Promise<StudyTotals> {
    const where: PrismaTypes.ReadingAttemptWhereInput = { status: "submitted", userId }
    const [result, passages] = await Promise.all([
      this._prisma.readingAttempt.aggregate({
        _count: { _all: true },
        _sum: { correctCount: true, elapsedSeconds: true, questionCount: true },
        where,
      }),
      this._prisma.readingAttempt.findMany({ distinct: ["passageId"], select: { passageId: true }, where }),
    ])
    return {
      attemptCount: result._count._all,
      correctCount: result._sum.correctCount ?? 0,
      passageCount: passages.length,
      questionCount: result._sum.questionCount ?? 0,
      studySeconds: result._sum.elapsedSeconds ?? 0,
    }
  }
}
