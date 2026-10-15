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
  vocabularyReviews,
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
 * 単語帳の答えのうち、そのユーザーの行だけに絞る条件（(user_id, study_date) の index が効く）
 */
const buildReviewCondition = (userId: number) => eq(vocabularyReviews.userId, userId)

/**
 * 単語帳でカードを見ていた秒数の合計（行が無ければ 0）
 */
const sumReviewSeconds = sql<number>`coalesce(sum(${vocabularyReviews.activeSeconds}), 0)`.mapWith(Number)

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

export class DrizzleLearningRecordRepository implements LearningRecordRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  /**
   * 挑戦と単語帳の学習した日を別々に引き、和集合を日付の昇順にする
   */
  public async findStudyDates(userId: number): Promise<string[]> {
    const [attemptRows, reviewRows] = await Promise.all([
      this._db
        .selectDistinct({ studyDate: readingAttempts.studyDate })
        .from(readingAttempts)
        .where(buildSubmittedCondition(userId)),
      this._db
        .selectDistinct({ studyDate: vocabularyReviews.studyDate })
        .from(vocabularyReviews)
        .where(buildReviewCondition(userId)),
    ])
    const dates = new Set([
      ...attemptRows.flatMap((row) => (row.studyDate === null ? [] : [row.studyDate])),
      ...reviewRows.map((row) => row.studyDate),
    ])
    return [...dates].sort()
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
      listenedBlockCount: attempt.listenedBlockCount,
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

  /**
   * 挑戦と単語帳を別々に日ごとに集計し、日付で合わせる（1 本の UNION ALL にすると、両方の列を NULL で埋め合わせる形になり読みにくいため）
   */
  public async summarizeByDate(userId: number, range: { from: string; to: string }): Promise<DailyStudySummary[]> {
    const [attemptRows, reviewRows] = await Promise.all([
      this._db
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
        .groupBy(readingAttempts.studyDate),
      this._db
        .select({
          cardCount: count(),
          date: vocabularyReviews.studyDate,
          rememberedCount: sql<number>`count(*) FILTER (WHERE ${vocabularyReviews.grade} = 'remembered')`.mapWith(Number),
          studySeconds: sumReviewSeconds,
        })
        .from(vocabularyReviews)
        .where(
          and(
            buildReviewCondition(userId),
            gte(vocabularyReviews.studyDate, range.from),
            lte(vocabularyReviews.studyDate, range.to),
          ),
        )
        .groupBy(vocabularyReviews.studyDate),
    ])

    const byDate = new Map<string, DailyStudySummary>()
    const findOrCreate = (date: string): DailyStudySummary => {
      const existing = byDate.get(date)
      if (existing) return existing
      const created = { attemptCount: 0, cardCount: 0, correctCount: 0, date, questionCount: 0, rememberedCount: 0, studySeconds: 0 }
      byDate.set(date, created)
      return created
    }
    for (const { date, ...summary } of attemptRows) {
      if (date === null) continue
      Object.assign(findOrCreate(date), summary)
    }
    /**
     * 挑戦の側を先に入れてから足す（挑戦の Object.assign が studySeconds を上書きするため、順番を変えない）
     */
    for (const row of reviewRows) {
      const day = findOrCreate(row.date)
      day.cardCount = row.cardCount
      day.rememberedCount = row.rememberedCount
      day.studySeconds += row.studySeconds
    }
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
  }

  /**
   * 和訳・単語・読み上げをどれも使っていない挑戦だけ
   */
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
          eq(readingAttempts.listenedBlockCount, 0),
          eq(readingAttempts.translatedBlockCount, 0),
          eq(readingAttempts.wordLookupCount, 0),
        ),
      )
    return row
  }

  /**
   * 学習秒数にだけ単語帳の秒数を足す
   */
  public async summarizeTotals(userId: number): Promise<StudyTotals> {
    const [[row], [review]] = await Promise.all([
      this._db
        .select({
          attemptCount: count(),
          correctCount: sumColumn(readingAttempts.correctCount),
          passageCount: countDistinct(readingAttempts.passageId),
          questionCount: sumColumn(readingAttempts.questionCount),
          studySeconds: sumColumn(readingAttempts.elapsedSeconds),
        })
        .from(readingAttempts)
        .where(buildSubmittedCondition(userId)),
      this._db.select({ studySeconds: sumReviewSeconds }).from(vocabularyReviews).where(buildReviewCondition(userId)),
    ])
    return { ...row, studySeconds: row.studySeconds + review.studySeconds }
  }
}
