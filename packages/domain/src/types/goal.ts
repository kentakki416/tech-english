import type { GOAL_METRICS } from "../const/goal"

/**
 * 週の目標の指標
 */
export type GoalMetric = (typeof GOAL_METRICS)[number]

/**
 * ユーザーの目標（1 ユーザー 1 行）。日付は `YYYY-MM-DD` の文字列で持つ
 */
export type UserGoal = {
  id: number
  goalText: string | null
  targetDate: string | null
  userId: number
  /**
   * weeklyTarget と両方あるか両方 null
   */
  weeklyMetric: GoalMetric | null
  /**
   * 1 以上。passages は問題数、minutes は分
   */
  weeklyTarget: number | null
  createdAt: Date
  updatedAt: Date
}

/**
 * 学習カレンダーの色の段階（0 = 学習なし 〜 4）
 */
export type CalendarLevel = 0 | 1 | 2 | 3 | 4

/**
 * 連続学習日数（現在 / 最長）
 */
export type StreakSummary = { current: number, longest: number }

/**
 * 週の範囲（月曜〜日曜。`YYYY-MM-DD`）
 */
export type WeekRange = { end: string, start: string }
