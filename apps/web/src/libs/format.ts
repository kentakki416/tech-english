/**
 * 画面の数値・時間の書式。Client Component からも使うので `server-only` を付けない
 */

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]

/**
 * 秒を `m:ss` にする（負の値は `-m:ss`）
 */
export const formatSeconds = (totalSeconds: number): string => {
  const sign = totalSeconds < 0 ? "-" : ""
  const abs = Math.abs(totalSeconds)
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`
}

/**
 * 学習秒数を分にする。学習した日が「0 分」にならないように切り上げる
 */
export const convertStudySecondsToMinutes = (studySeconds: number): number => Math.ceil(studySeconds / 60)

/**
 * 学習秒数を `9時間12分` にする（1 時間未満は `12分`）
 */
export const formatStudyTime = (studySeconds: number): string => {
  const minutes = convertStudySecondsToMinutes(studySeconds)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}時間${minutes % 60}分` : `${minutes}分`
}

/**
 * `YYYY-MM-DD` を UTC の Date にする（曜日を端末のタイムゾーンに左右されずに求めるため）
 */
const convertDateStringToUtcDate = (date: string): Date => new Date(`${date}T00:00:00Z`)

/**
 * `YYYY-MM-DD` を `10月10日（土）` にする
 */
export const formatDayLabel = (date: string): string => {
  const value = convertDateStringToUtcDate(date)
  return `${value.getUTCMonth() + 1}月${value.getUTCDate()}日（${WEEKDAY_LABELS[value.getUTCDay()]}）`
}

/**
 * `YYYY-MM-DD` を `2026年10月10日（土）` にする
 */
export const formatDateHeading = (date: string): string =>
  `${convertDateStringToUtcDate(date).getUTCFullYear()}年${formatDayLabel(date)}`
