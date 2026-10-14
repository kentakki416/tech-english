/**
 * 画面の数値・時間の書式（web の `src/libs/format.ts` と同じ）
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

const SECONDS_PER_MINUTE = 60

/**
 * 学習秒数を分にする。学習時間の分の表示はすべてここを通し、端数は切り捨てる（api の週の目標の進捗と同じ）
 */
const convertStudySecondsToMinutes = (studySeconds: number): number => Math.floor(studySeconds / SECONDS_PER_MINUTE)

/**
 * 学習はしているが切り捨てると 0 分になる（0 秒より多く 60 秒未満）か。このときは「1 分未満」と出す
 */
const isUnderOneMinute = (studySeconds: number): boolean => studySeconds > 0 && studySeconds < SECONDS_PER_MINUTE

/**
 * 学習秒数を `12 分` にする（カレンダーのマス・選んだ日）。0 秒より多く 60 秒未満は `1 分未満`
 */
export const formatStudyMinutes = (studySeconds: number): string =>
  isUnderOneMinute(studySeconds) ? "1 分未満" : `${convertStudySecondsToMinutes(studySeconds)} 分`

/**
 * 学習秒数を `9時間12分` にする（1 時間未満は `12分`、0 秒より多く 60 秒未満は `1分未満`）
 */
export const formatStudyTime = (studySeconds: number): string => {
  if (isUnderOneMinute(studySeconds)) return "1分未満"
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
