/**
 * 週の目標の指標
 *
 * - passages: 問題数（提出した挑戦の数。同じ問題を 2 回解けば 2）
 * - minutes: 学習時間（分）
 */
export const GOAL_METRICS = ["passages", "minutes"] as const

/**
 * 自由記述の目標の最大文字数（DB の varchar と API の検証の両方が参照する）
 */
export const GOAL_TEXT_MAX_LENGTH = 200
