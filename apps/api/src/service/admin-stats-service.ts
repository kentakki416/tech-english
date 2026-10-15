import {
  ADMIN_STATS_TIME_ZONE,
  type AdminPassageStatsSort,
  type AdminStatsPeriod,
  getWeekRange,
  type QuestionType,
} from "@repo/domain"
import { err, notFoundError, ok, Result } from "@repo/errors"

import { isQuestionNeedingReview } from "../lib/is-question-needing-review"
import { resolveStatsPeriod } from "../lib/resolve-stats-period"
import { formatDateInTimeZone } from "../lib/time-zone"
import type { AdminStatsRepository, AttemptTotals, PassageStatsRow, SeriesPoint } from "../repository"

type AdminStatsRepo = { adminStatsRepository: AdminStatsRepository }

/**
 * 解いた挑戦の合計から求める比率（0〜1）と平均。分母が 0 なら null
 */
export type AttemptRates = {
  assistRates: { listened: number | null; lookedUp: number | null; translated: number | null }
  averageElapsedSeconds: number | null
  correctRate: number | null
  overtimeRate: number | null
}

export type AdminStatsOverview = AttemptRates & {
  activeUsers: number
  /**
   * 期間の始まりと終わり（日本時間の日付）
   */
  fromDate: string
  newUsers: number
  period: AdminStatsPeriod
  series: { bucket: "day" | "week"; points: SeriesPoint[] }
  solvedAttempts: number
  solvedUsers: number
  toDate: string
  totalUsers: number
}

export type AdminPassageStats = Omit<PassageStatsRow, keyof AttemptTotals> & AttemptRates & {
  solvedAttempts: number
  solvedUsers: number
}

export type AdminPassageStatsList = { items: AdminPassageStats[]; limit: number; page: number; total: number }

export type AdminQuestionStats = {
  id: number
  answerCount: number
  choiceRates: (number | null)[]
  choices: string[]
  correctChoiceIndex: number
  correctRate: number | null
  needsReview: boolean
  orderIndex: number
  prompt: string
  type: QuestionType
  unansweredRate: number | null
}

export type AdminPassageStatsDetail = { passage: AdminPassageStats; period: AdminStatsPeriod; questions: AdminQuestionStats[] }

/**
 * 分母が 0 なら null
 */
const divideOrNull = (numerator: number, denominator: number): number | null => (denominator === 0 ? null : numerator / denominator)

/**
 * 解いた挑戦の合計を、正答率・平均の解答時間・時間超過の割合・アシストの利用率にする
 */
const convertAttemptTotalsToRates = (totals: AttemptTotals): AttemptRates => ({
  assistRates: {
    listened: divideOrNull(totals.listenedAttempts, totals.solvedAttempts),
    lookedUp: divideOrNull(totals.lookedUpAttempts, totals.solvedAttempts),
    translated: divideOrNull(totals.translatedAttempts, totals.solvedAttempts),
  },
  averageElapsedSeconds: divideOrNull(totals.elapsedSecondsSum, totals.solvedAttempts),
  correctRate: divideOrNull(totals.correctCount, totals.questionCount),
  overtimeRate: divideOrNull(totals.overtimeAttempts, totals.solvedAttempts),
})

const convertPassageStatsRowToStats = (row: PassageStatsRow): AdminPassageStats => ({
  id: row.id,
  ...convertAttemptTotalsToRates(row),
  difficulty: row.difficulty,
  publishedAt: row.publishedAt,
  solvedAttempts: row.solvedAttempts,
  solvedUsers: row.solvedUsers,
  source: row.source,
  status: row.status,
  timeLimitSeconds: row.timeLimitSeconds,
  title: row.title,
})

/**
 * 全体の利用状況。全期間の始まりは最初のユーザーの登録日（いなければ今日）。週ごとの推移は始まりと終わりを月曜にそろえる
 * （date_trunc('week') の月曜と系列の日付を合わせるため）
 */
export const getAdminStatsOverview = async (
  period: AdminStatsPeriod,
  repo: AdminStatsRepo,
  deps: { now: Date },
): Promise<Result<AdminStatsOverview>> => {
  const range = resolveStatsPeriod(period, deps.now)
  const [totals, firstUserCreatedAt] = await Promise.all([
    repo.adminStatsRepository.summarizeOverview({ from: range.from, to: range.to }),
    range.fromDate === null ? repo.adminStatsRepository.findFirstUserCreatedAt() : Promise.resolve(null),
  ])
  const fromDate = range.fromDate ?? (firstUserCreatedAt === null ? range.toDate : formatDateInTimeZone(firstUserCreatedAt, ADMIN_STATS_TIME_ZONE))
  const points = await repo.adminStatsRepository.findOverviewSeries(
    range.bucket === "week"
      ? { bucket: "week", fromDate: getWeekRange(fromDate).start, toDate: getWeekRange(range.toDate).start }
      : { bucket: "day", fromDate, toDate: range.toDate },
  )
  return ok({
    ...convertAttemptTotalsToRates(totals),
    activeUsers: totals.activeUsers,
    fromDate,
    newUsers: totals.newUsers,
    period,
    series: { bucket: range.bucket, points },
    solvedAttempts: totals.solvedAttempts,
    solvedUsers: totals.solvedUsers,
    toDate: range.toDate,
    totalUsers: totals.totalUsers,
  })
}

/**
 * 問題ごとの成績（page は 1 始まり。範囲外のページは空の配列で、total は全体の件数）
 */
export const getAdminPassageStatsList = async (
  query: { limit: number; order: "asc" | "desc"; page: number; period: AdminStatsPeriod; q?: string; sort: AdminPassageStatsSort },
  repo: AdminStatsRepo,
  deps: { now: Date },
): Promise<Result<AdminPassageStatsList>> => {
  const range = resolveStatsPeriod(query.period, deps.now)
  const { items, total } = await repo.adminStatsRepository.findPassageStats({
    from: range.from,
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
    order: query.order,
    q: query.q,
    sort: query.sort,
    to: range.to,
  })
  return ok({ items: items.map(convertPassageStatsRowToStats), limit: query.limit, page: query.page, total })
}

/**
 * 問題の分析（問題の数字と設問ごとの数字）。問題が無ければ notFoundError
 */
export const getAdminPassageStats = async (
  passageId: number,
  period: AdminStatsPeriod,
  repo: AdminStatsRepo,
  deps: { now: Date },
): Promise<Result<AdminPassageStatsDetail>> => {
  const range = resolveStatsPeriod(period, deps.now)
  const timeRange = { from: range.from, to: range.to }
  const [passage, questions] = await Promise.all([
    repo.adminStatsRepository.findPassageStatsById(passageId, timeRange),
    repo.adminStatsRepository.findQuestionStats(passageId, timeRange),
  ])
  if (passage === null) return err(notFoundError("Passage not found"))
  return ok({
    passage: convertPassageStatsRowToStats(passage),
    period,
    questions: questions.map((question) => ({
      id: question.id,
      answerCount: question.answerCount,
      choiceRates: question.choiceCounts.map((count) => divideOrNull(count, question.answerCount)),
      choices: question.choices,
      correctChoiceIndex: question.correctChoiceIndex,
      correctRate: divideOrNull(question.correctCount, question.answerCount),
      needsReview: isQuestionNeedingReview(question),
      orderIndex: question.orderIndex,
      prompt: question.prompt,
      type: question.type,
      unansweredRate: divideOrNull(question.unansweredCount, question.answerCount),
    })),
  })
}
