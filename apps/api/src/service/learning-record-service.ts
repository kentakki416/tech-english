import {
  addDaysToDate,
  calculateStreak,
  type CalendarLevel,
  convertStudySecondsToLevel,
  countDaysBetween,
  getWeekRange,
  type GoalMetric,
  QUESTION_TYPES,
  type QuestionType,
  type User,
  type UserGoal,
} from "@repo/domain"
import { badRequestError, err, ok, Result, unauthorizedError } from "@repo/errors"

import { formatDateInTimeZone, formatTimeInTimeZone } from "../lib/time-zone"
import type {
  AccuracyCount,
  DailyStudySummary,
  LearningRecordRepository,
  SubmittedAttempt,
  UserGoalRepository,
  UserRepository,
} from "../repository"

/**
 * カレンダーで一度に取れる日数（learning-record README「必要な API」: 最大 366 日）
 */
const CALENDAR_MAX_DAYS = 366

/**
 * 年表示の列数（1 列 = 月曜始まりの 1 週）
 */
const CALENDAR_YEAR_WEEK_COUNT = 53

/**
 * マイページの最近の挑戦の件数
 */
const RECENT_ATTEMPT_LIMIT = 5

/**
 * 連続学習日数の区画に並べる直近の日数（今日を含む）
 */
const RECENT_DAY_COUNT = 14

const SECONDS_PER_MINUTE = 60

/**
 * 正答率。設問が 0 問なら accuracyPercent は null（四捨五入した整数 %）
 */
export type Accuracy = AccuracyCount & { accuracyPercent: number | null }

/**
 * 提出した挑戦の一覧の 1 行
 */
export type LearningRecordAttemptView = {
  id: number
  correctCount: number
  elapsedSeconds: number
  isOvertime: boolean
  passageId: number
  questionCount: number
  studyDate: string
  submittedAt: Date
  /**
   * 提出時刻 HH:mm（リクエスト時点の users.timezone）
   */
  submittedTime: string
  title: string
  /**
   * 訳の表示・単語の意味のどちらかを 1 回以上使った
   */
  usedAssist: boolean
}

/**
 * 目標と今週の進捗
 */
export type GoalProgressView = {
  /**
   * targetDate − 今日。過ぎていれば負、目標日が無ければ null
   */
  daysLeft: number | null
  goalText: string | null
  isWeeklyAchieved: boolean
  targetDate: string | null
  weeklyMetric: GoalMetric | null
  /**
   * passages は今週の提出数、minutes は今週の学習秒数 ÷ 60 の切り捨て。週の目標が無ければ null
   */
  weeklyProgress: number | null
  weeklyTarget: number | null
}

/**
 * マイページの統計
 */
export type UserStats = {
  goal: GoalProgressView | null
  noAssist: Accuracy
  recentAttempts: LearningRecordAttemptView[]
  streak: {
    current: number
    longest: number
    /**
     * 直近 14 日（今日が末尾）
     */
    recentDays: { date: string; hasStudied: boolean }[]
  }
  today: string
  totals: Accuracy & { attemptCount: number; passageCount: number; studySeconds: number }
  /**
   * QUESTION_TYPES の順
   */
  typeAccuracy: (Accuracy & { type: QuestionType })[]
  weakestQuestionType: QuestionType | null
}

/**
 * カレンダーの 1 日
 */
export type CalendarDayView = DailyStudySummary & { level: CalendarLevel }

/**
 * 学習カレンダー（from〜to の全日）
 */
export type UserCalendar = {
  days: CalendarDayView[]
  from: string
  to: string
  today: string
}

/**
 * 提出した挑戦の一覧の 1 ページ
 */
export type UserAttempts = {
  attempts: LearningRecordAttemptView[]
  nextCursor: number | null
}

type LearningRecordRepo = {
  learningRecordRepository: LearningRecordRepository
  userGoalRepository: UserGoalRepository
  userRepository: UserRepository
}

/**
 * 「今日」を求めるのにタイムゾーンが要るため、読み取りの API でもユーザーが無ければ 401 にする
 * （削除済みユーザーの access token。クライアントは refresh に失敗してログイン画面へ戻る）
 */
const findUser = async (userId: number, repo: { userRepository: UserRepository }): Promise<Result<User>> => {
  const user = await repo.userRepository.findById(userId)
  if (!user) return err(unauthorizedError("User not found"))
  return ok(user)
}

const calculateAccuracy = (count: AccuracyCount): Accuracy => ({
  accuracyPercent: count.questionCount === 0 ? null : Math.round((count.correctCount / count.questionCount) * 100),
  correctCount: count.correctCount,
  questionCount: count.questionCount,
})

const convertSubmittedAttemptToView = (attempt: SubmittedAttempt, timeZone: string): LearningRecordAttemptView => ({
  id: attempt.id,
  correctCount: attempt.correctCount,
  elapsedSeconds: attempt.elapsedSeconds,
  isOvertime: attempt.isOvertime,
  passageId: attempt.passageId,
  questionCount: attempt.questionCount,
  studyDate: attempt.studyDate,
  submittedAt: attempt.submittedAt,
  submittedTime: formatTimeInTimeZone(attempt.submittedAt, timeZone),
  title: attempt.passageTitle,
  usedAssist: attempt.translatedBlockCount > 0 || attempt.wordLookupCount > 0,
})

/**
 * 今週の進捗。週の目標が無ければ進捗は null で未達成
 */
const calculateGoalProgress = (goal: UserGoal, weekDays: DailyStudySummary[], today: string): GoalProgressView => {
  const daysLeft = goal.targetDate === null ? null : countDaysBetween(today, goal.targetDate)
  const base = {
    daysLeft,
    goalText: goal.goalText,
    targetDate: goal.targetDate,
    weeklyMetric: goal.weeklyMetric,
    weeklyTarget: goal.weeklyTarget,
  }
  if (goal.weeklyMetric === null || goal.weeklyTarget === null) {
    return { ...base, isWeeklyAchieved: false, weeklyProgress: null }
  }
  const weeklyProgress = goal.weeklyMetric === "passages"
    ? weekDays.reduce((sum, day) => sum + day.attemptCount, 0)
    : Math.floor(weekDays.reduce((sum, day) => sum + day.studySeconds, 0) / SECONDS_PER_MINUTE)
  return { ...base, isWeeklyAchieved: weeklyProgress >= goal.weeklyTarget, weeklyProgress }
}

/**
 * 正答率が一番低い種類。丸める前の比で比べ、同率なら QUESTION_TYPES の順で先のもの。設問のある種類が無ければ null
 */
const findWeakestQuestionType = (counts: (AccuracyCount & { type: QuestionType })[]): QuestionType | null => {
  let weakest: { ratio: number; type: QuestionType } | null = null
  for (const count of counts) {
    if (count.questionCount === 0) continue
    const ratio = count.correctCount / count.questionCount
    if (weakest === null || ratio < weakest.ratio) weakest = { ratio, type: count.type }
  }
  return weakest?.type ?? null
}

/**
 * マイページの統計（連続学習日数・目標の進捗・累計・設問の種類別の正答率・最近の挑戦）
 *
 * 「今日」「今週」はリクエスト時点の users.timezone で求める。集計そのものは study_date だけで決まり、タイムゾーン変換はしない
 */
export const getUserStats = async (
  userId: number,
  repo: LearningRecordRepo,
  deps: { now: Date },
): Promise<Result<UserStats>> => {
  const userResult = await findUser(userId, repo)
  if (!userResult.ok) return userResult
  const user = userResult.value

  const today = formatDateInTimeZone(deps.now, user.timezone)
  const week = getWeekRange(today)
  const [studyDates, weekDays, totals, noAssist, byType, recent, goal] = await Promise.all([
    repo.learningRecordRepository.findStudyDates(userId),
    repo.learningRecordRepository.summarizeByDate(userId, { from: week.start, to: week.end }),
    repo.learningRecordRepository.summarizeTotals(userId),
    repo.learningRecordRepository.summarizeNoAssistAccuracy(userId),
    repo.learningRecordRepository.summarizeAccuracyByQuestionType(userId),
    repo.learningRecordRepository.findSubmittedAttempts(userId, { limit: RECENT_ATTEMPT_LIMIT }),
    repo.userGoalRepository.findByUserId(userId),
  ])

  const streak = calculateStreak(studyDates, today)
  const studyDateSet = new Set(studyDates)
  const recentDays = Array.from({ length: RECENT_DAY_COUNT }, (_, index) => {
    const date = addDaysToDate(today, index - (RECENT_DAY_COUNT - 1))
    return { date, hasStudied: studyDateSet.has(date) }
  })

  const countByType = new Map(byType.map((count) => [count.type, count]))
  const typeCounts = QUESTION_TYPES.map((type) => ({
    correctCount: countByType.get(type)?.correctCount ?? 0,
    questionCount: countByType.get(type)?.questionCount ?? 0,
    type,
  }))

  return ok({
    goal: goal === null ? null : calculateGoalProgress(goal, weekDays, today),
    noAssist: calculateAccuracy(noAssist),
    recentAttempts: recent.map((attempt) => convertSubmittedAttemptToView(attempt, user.timezone)),
    streak: { current: streak.current, longest: streak.longest, recentDays },
    today,
    totals: {
      ...calculateAccuracy(totals),
      attemptCount: totals.attemptCount,
      passageCount: totals.passageCount,
      studySeconds: totals.studySeconds,
    },
    typeAccuracy: typeCounts.map((count) => ({ ...calculateAccuracy(count), type: count.type })),
    weakestQuestionType: findWeakestQuestionType(typeCounts),
  })
}

/**
 * 期間の省略時は年表示の範囲（今日まで、月曜始まりの 53 列に収まる日数）。
 * 最初の列の月曜から数えると 367〜371 日になりうるので、366 日を超えないよう今日の 365 日前より前には広げない
 * （最初の列の範囲外の日はクライアントが空のマスにする）
 */
const resolveDefaultCalendarRange = (today: string): { from: string; to: string } => {
  const firstColumnStart = addDaysToDate(getWeekRange(today).start, -7 * (CALENDAR_YEAR_WEEK_COUNT - 1))
  const earliest = addDaysToDate(today, -(CALENDAR_MAX_DAYS - 1))
  return { from: firstColumnStart > earliest ? firstColumnStart : earliest, to: today }
}

/**
 * 学習カレンダー。from〜to の全日を、学習していない日も level 0 で返す（to が未来でもよい。月表示が月末まで要求するため）
 *
 * from と to は両方指定か両方省略。片方だけ・from > to・366 日を超える期間は 400
 */
export const getUserCalendar = async (
  userId: number,
  range: { from?: string; to?: string },
  repo: { learningRecordRepository: LearningRecordRepository; userRepository: UserRepository },
  deps: { now: Date },
): Promise<Result<UserCalendar>> => {
  if ((range.from === undefined) !== (range.to === undefined)) {
    return err(badRequestError("from and to must be specified together"))
  }
  if (range.from !== undefined && range.to !== undefined) {
    const dayCount = countDaysBetween(range.from, range.to) + 1
    if (dayCount < 1) return err(badRequestError("from must be on or before to"))
    if (dayCount > CALENDAR_MAX_DAYS) return err(badRequestError(`The range must be at most ${CALENDAR_MAX_DAYS} days`))
  }

  const userResult = await findUser(userId, repo)
  if (!userResult.ok) return userResult
  const today = formatDateInTimeZone(deps.now, userResult.value.timezone)

  const { from, to } = range.from !== undefined && range.to !== undefined
    ? { from: range.from, to: range.to }
    : resolveDefaultCalendarRange(today)
  const summaries = await repo.learningRecordRepository.summarizeByDate(userId, { from, to })
  const summaryByDate = new Map(summaries.map((summary) => [summary.date, summary]))

  const days = Array.from({ length: countDaysBetween(from, to) + 1 }, (_, index): CalendarDayView => {
    const date = addDaysToDate(from, index)
    const summary = summaryByDate.get(date)
    const studySeconds = summary?.studySeconds ?? 0
    return {
      attemptCount: summary?.attemptCount ?? 0,
      correctCount: summary?.correctCount ?? 0,
      date,
      level: convertStudySecondsToLevel(studySeconds),
      questionCount: summary?.questionCount ?? 0,
      studySeconds,
    }
  })

  return ok({ days, from, to, today })
}

/**
 * 提出した挑戦の一覧（新しい順）。limit + 1 件読み、余りがあれば最後に返した行の id を nextCursor にする
 */
export const getUserAttempts = async (
  userId: number,
  query: { cursor?: number; date?: string; limit: number },
  repo: { learningRecordRepository: LearningRecordRepository; userRepository: UserRepository },
): Promise<Result<UserAttempts>> => {
  const userResult = await findUser(userId, repo)
  if (!userResult.ok) return userResult
  const user = userResult.value

  const rows = await repo.learningRecordRepository.findSubmittedAttempts(userId, {
    cursor: query.cursor,
    date: query.date,
    limit: query.limit + 1,
  })
  const page = rows.slice(0, query.limit)
  const hasNext = rows.length > query.limit

  return ok({
    attempts: page.map((attempt) => convertSubmittedAttemptToView(attempt, user.timezone)),
    nextCursor: hasNext ? page[page.length - 1].id : null,
  })
}
