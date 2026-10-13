import {
  and,
  asc,
  attemptAnswers,
  count,
  countDistinct,
  desc,
  DrizzleClient,
  eq,
  gte,
  lte,
  passages,
  questions,
  readingAttempts,
  sql,
} from "@repo/db"

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
 * そのユーザーの提出した挑戦だけに絞る条件（(user_id, study_date) の index が効く）
 */
const buildSubmittedCondition = (userId: number) =>
  and(eq(readingAttempts.userId, userId), eq(readingAttempts.status, "submitted"))

/**
 * 列の合計。pg の sum は bigint（文字列）で返り、行が無ければ NULL なので、0 に寄せて数値にする
 */
const sumColumn = (column: typeof readingAttempts.correctCount | typeof readingAttempts.elapsedSeconds | typeof readingAttempts.questionCount) =>
  sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number)

/**
 * submitted の行は CHECK 制約（reading_attempts_submitted_columns_check）で採点結果と時間が必ずある。
 * 型の上では NULL になりうるので、ここで確かめてから非 NULL の型にする
 */
const requireSubmittedValue = <T>(value: T | null, column: string, attemptId: number): T => {
  if (value === null) throw new Error(`Submitted attempt has null ${column}: id=${attemptId}`)
  return value
}

/**
 * Drizzle 実装の LearningRecordRepository
 */
export class DrizzleLearningRecordRepository implements LearningRecordRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findStudyDates(userId: number): Promise<string[]> {
    const rows = await this._db
      .selectDistinct({ studyDate: readingAttempts.studyDate })
      .from(readingAttempts)
      .where(buildSubmittedCondition(userId))
      .orderBy(asc(readingAttempts.studyDate))
    return rows.flatMap((row) => (row.studyDate === null ? [] : [row.studyDate]))
  }

  /**
   * cursor は (submitted_at, id) の行の比較で続きを取る。cursor の挑戦をそのユーザーに限って引くので、
   * 他のユーザーの挑戦・存在しない id なら副問い合わせが NULL になり 0 件になる
   */
  public async findSubmittedAttempts(userId: number, options: FindSubmittedAttemptsOptions): Promise<SubmittedAttempt[]> {
    const rows = await this._db
      .select({ attempt: readingAttempts, passageTitle: passages.title })
      .from(readingAttempts)
      .innerJoin(passages, eq(passages.id, readingAttempts.passageId))
      .where(
        and(
          buildSubmittedCondition(userId),
          options.date === undefined ? undefined : eq(readingAttempts.studyDate, options.date),
          options.cursor === undefined
            ? undefined
            : sql`(${readingAttempts.submittedAt}, ${readingAttempts.id}) < (SELECT cursor_attempt.submitted_at, cursor_attempt.id FROM reading_attempts AS cursor_attempt WHERE cursor_attempt.id = ${options.cursor} AND cursor_attempt.user_id = ${userId})`,
        ),
      )
      .orderBy(desc(readingAttempts.submittedAt), desc(readingAttempts.id))
      .limit(options.limit)
    return rows.map(({ attempt, passageTitle }) => ({
      id: attempt.id,
      correctCount: requireSubmittedValue(attempt.correctCount, "correct_count", attempt.id),
      elapsedSeconds: requireSubmittedValue(attempt.elapsedSeconds, "elapsed_seconds", attempt.id),
      isOvertime: requireSubmittedValue(attempt.isOvertime, "is_overtime", attempt.id),
      passageId: attempt.passageId,
      passageTitle,
      questionCount: requireSubmittedValue(attempt.questionCount, "question_count", attempt.id),
      studyDate: requireSubmittedValue(attempt.studyDate, "study_date", attempt.id),
      submittedAt: requireSubmittedValue(attempt.submittedAt, "submitted_at", attempt.id),
      translatedBlockCount: attempt.translatedBlockCount,
      wordLookupCount: attempt.wordLookupCount,
    }))
  }

  /**
   * 回答（attempt_answers）を挑戦と設問に join して、設問の種類でまとめる。正答数は FILTER で数える
   */
  public async summarizeAccuracyByQuestionType(userId: number): Promise<QuestionTypeAccuracyCount[]> {
    return this._db
      .select({
        correctCount: sql<number>`count(*) FILTER (WHERE ${attemptAnswers.isCorrect})`.mapWith(Number),
        questionCount: count(),
        type: questions.type,
      })
      .from(attemptAnswers)
      .innerJoin(readingAttempts, eq(readingAttempts.id, attemptAnswers.attemptId))
      .innerJoin(questions, eq(questions.id, attemptAnswers.questionId))
      .where(buildSubmittedCondition(userId))
      .groupBy(questions.type)
      .orderBy(asc(questions.type))
  }

  public async summarizeByDate(userId: number, range: { from: string; to: string }): Promise<DailyStudySummary[]> {
    const rows = await this._db
      .select({
        attemptCount: count(),
        correctCount: sumColumn(readingAttempts.correctCount),
        date: readingAttempts.studyDate,
        questionCount: sumColumn(readingAttempts.questionCount),
        studySeconds: sumColumn(readingAttempts.elapsedSeconds),
      })
      .from(readingAttempts)
      .where(
        and(
          buildSubmittedCondition(userId),
          gte(readingAttempts.studyDate, range.from),
          lte(readingAttempts.studyDate, range.to),
        ),
      )
      .groupBy(readingAttempts.studyDate)
      .orderBy(asc(readingAttempts.studyDate))
    return rows.flatMap(({ date, ...summary }) => (date === null ? [] : [{ ...summary, date }]))
  }

  public async summarizeNoAssistAccuracy(userId: number): Promise<AccuracyCount> {
    const [row] = await this._db
      .select({
        correctCount: sumColumn(readingAttempts.correctCount),
        questionCount: sumColumn(readingAttempts.questionCount),
      })
      .from(readingAttempts)
      .where(
        and(
          buildSubmittedCondition(userId),
          eq(readingAttempts.translatedBlockCount, 0),
          eq(readingAttempts.wordLookupCount, 0),
        ),
      )
    return row
  }

  public async summarizeTotals(userId: number): Promise<StudyTotals> {
    const [row] = await this._db
      .select({
        attemptCount: count(),
        correctCount: sumColumn(readingAttempts.correctCount),
        passageCount: countDistinct(readingAttempts.passageId),
        questionCount: sumColumn(readingAttempts.questionCount),
        studySeconds: sumColumn(readingAttempts.elapsedSeconds),
      })
      .from(readingAttempts)
      .where(buildSubmittedCondition(userId))
    return row
  }
}
