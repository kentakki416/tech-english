import { formatSeconds } from "@/libs/mock-data"

/**
 * ダッシュボード・ユーザー管理のモックの表示の整形
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
 * 平均の解答時間を制限時間と並べて「5:12 / 6:00」に。null は EMPTY_VALUE
 */
export const formatElapsedWithLimit = (elapsedSeconds: number | null, timeLimitSeconds: number): string =>
  elapsedSeconds === null ? EMPTY_VALUE : `${formatSeconds(elapsedSeconds)} / ${formatSeconds(timeLimitSeconds)}`

/**
 * 学習時間（秒）を「7 時間 54 分」に
 */
export const formatStudyTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours} 時間 ${minutes} 分` : `${minutes} 分`
}
