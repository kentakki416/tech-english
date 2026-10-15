import type { AdminStatsPeriod } from "@repo/api-schema"

const STATS_PERIOD_LABELS: Record<AdminStatsPeriod, string> = {
  "30d": "直近 30 日",
  "7d": "直近 7 日",
  all: "全期間",
}

/**
 * 期間のタブの並び
 */
export const STATS_PERIOD_ORDER = ["7d", "30d", "all"] as const satisfies readonly AdminStatsPeriod[]

export const formatPeriodLabel = (period: AdminStatsPeriod): string => STATS_PERIOD_LABELS[period]

/**
 * 問題ごとの成績の項目名。表の見出しと問題の分析の数字で同じ名前にする
 */
export const PASSAGE_STATS_LABELS = {
  assistRates: "アシスト（和訳 / 単語 / 読み上げ）",
  averageElapsedSeconds: "平均時間 / 制限",
  correctRate: "正答率",
  overtimeRate: "時間超過",
  publishedAt: "公開日",
  solvedAttempts: "解いた回数",
  solvedUsers: "解いた人数",
} as const
