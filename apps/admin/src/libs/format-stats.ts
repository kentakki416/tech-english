/**
 * ダッシュボード・ユーザー管理の数字の表示（admin-dashboard の UI 設計「数字の書き方」）。Client Component からも使うので server-only にしない
 */

/**
 * 値が無い（分母が 0・未設定）ときに出す文字。既存の admin の画面（問題一覧など）と同じ
 */
export const EMPTY_VALUE = "―"

/**
 * 比率（0〜1）を「72%」に。null（分母が 0）は EMPTY_VALUE
 */
export const formatRate = (rate: number | null): string => (rate === null ? EMPTY_VALUE : `${Math.round(rate * 100)}%`)

/**
 * 件数を「1,284」に
 */
export const formatCount = (value: number): string => value.toLocaleString("en-US")

/**
 * YYYY-MM-DD を「10/15」に
 */
export const formatShortDate = (date: string): string => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

/**
 * 秒を「5:12」に
 */
export const formatMinutesSeconds = (totalSeconds: number): string => {
  const rounded = Math.round(totalSeconds)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`
}

/**
 * 平均の解答時間を制限時間と並べて「5:12 / 6:00」に。平均が null（解かれていない）なら EMPTY_VALUE、制限時間が無ければ平均だけ
 */
export const formatElapsedWithLimit = (elapsedSeconds: number | null, timeLimitSeconds: number | null): string => {
  if (elapsedSeconds === null) return EMPTY_VALUE
  return timeLimitSeconds === null
    ? formatMinutesSeconds(elapsedSeconds)
    : `${formatMinutesSeconds(elapsedSeconds)} / ${formatMinutesSeconds(timeLimitSeconds)}`
}

/**
 * 学習時間（秒）を「7 時間 54 分」に
 */
export const formatStudyTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours} 時間 ${minutes} 分` : `${minutes} 分`
}
