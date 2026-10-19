/**
 * ダッシュボード・ユーザー管理の数字の表示（admin-dashboard の UI 設計「数字の書き方」）。Client Component からも使うので server-only にしない
 */

/**
 * 値が無い（分母が 0・未設定）ときに出す文字。既存の admin の画面（問題一覧など）と同じ
 */
export const EMPTY_VALUE = "―"

/**
 * 比率（0〜1）を表示する整数の %（0.495 → 50）。色分けの判定も表示と同じ値でする
 */
export const convertRateToPercent = (rate: number): number => Math.round(rate * 100)

/**
 * 比率（0〜1）を「72%」に。null（分母が 0）は EMPTY_VALUE
 */
export const formatRate = (rate: number | null): string => (rate === null ? EMPTY_VALUE : `${convertRateToPercent(rate)}%`)

/**
 * アシストの利用率を「和訳 / 設問訳 / 単語 / 読み上げ」の順に「12% / 3% / 40% / 8%」に（問題ごとの成績と問題の分析で同じ並び）
 */
export const formatAssistRates = (rates: {
  listened: number | null
  looked_up: number | null
  translated: number | null
  translated_question: number | null
}): string =>
  `${formatRate(rates.translated)} / ${formatRate(rates.translated_question)} / ${formatRate(rates.looked_up)} / ${formatRate(rates.listened)}`

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
 * 学習時間（秒）を「7 時間 54 分」に。分は切り捨て、0 秒より多く 60 秒未満は「1 分未満」（web のマイページの formatStudyTime と同じ）
 */
export const formatStudyTime = (seconds: number): string => {
  if (seconds > 0 && seconds < 60) return "1 分未満"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours} 時間 ${minutes} 分` : `${minutes} 分`
}

/**
 * 表の下の「1〜50 件目 / 1,284 件」。行が無い（0 件・範囲外のページ）ときは「0〜0 件目」。unit は「件」「人」
 */
export const formatRowRange = (range: { limit: number, page: number, rowCount: number, total: number }, unit: string): string => {
  const first = range.rowCount === 0 ? 0 : (range.page - 1) * range.limit + 1
  const last = range.rowCount === 0 ? 0 : (range.page - 1) * range.limit + range.rowCount
  return `${formatCount(first)}〜${formatCount(last)} ${unit}目 / ${formatCount(range.total)} ${unit}`
}
