/**
 * admin のダッシュボードの期間（直近 7 日・直近 30 日・全期間）
 */
export const ADMIN_STATS_PERIODS = ["7d", "30d", "all"] as const

/**
 * 問題ごとの成績の並べ替えの列
 */
export const ADMIN_PASSAGE_STATS_SORTS = [
  "average_elapsed_seconds",
  "correct_rate",
  "overtime_rate",
  "published_at",
  "solved_attempts",
  "solved_users",
] as const

/**
 * 問題の分析で「要確認」の印を付けるのに要る、設問の期間内の解答の数の下限（少ないと偶然の偏りが大きいため）
 */
export const ADMIN_QUESTION_REVIEW_MIN_ANSWERS = 5

/**
 * ダッシュボードの日の区切り（admin は日本の管理者を想定する）
 */
export const ADMIN_STATS_TIME_ZONE = "Asia/Tokyo"

/**
 * ADMIN_STATS_TIME_ZONE の UTC からのずれ。日本は夏時間が無いので 1 つに決まる（日付の 0 時の時刻を求めるのに使う。ADMIN_STATS_TIME_ZONE と一緒に変える）
 */
export const ADMIN_STATS_UTC_OFFSET = "+09:00"
