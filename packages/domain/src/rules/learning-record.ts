import type { CalendarLevel, StreakSummary, WeekRange } from "../types/goal"

/**
 * 学習記録の計算。日付は `YYYY-MM-DD` の文字列で受け渡し、関数の中でタイムゾーンを扱わない
 * （「今日」は呼び出し側が users.timezone で求めて引数で渡す）。
 * 日付の計算は Date.UTC で行い、ブラウザ / React Native でも同じ結果になるようにする
 */

const MILLISECONDS_PER_DAY = 86_400_000

/**
 * 色の段階が上がる学習秒数の上限（5 分 / 15 分 / 30 分。上限ちょうどは下の段階）
 */
const LEVEL_UPPER_SECONDS = [300, 900, 1800] as const

const convertDateToUtcMilliseconds = (date: string): number => {
  const [year, month, day] = date.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * 日付に日数を足す（負の数で過去へ）
 */
export const addDaysToDate = (date: string, days: number): string =>
  new Date(convertDateToUtcMilliseconds(date) + days * MILLISECONDS_PER_DAY).toISOString().slice(0, 10)

/**
 * from から to までの日数（同じ日なら 0、to が前なら負）
 */
export const countDaysBetween = (from: string, to: string): number =>
  Math.round((convertDateToUtcMilliseconds(to) - convertDateToUtcMilliseconds(from)) / MILLISECONDS_PER_DAY)

/**
 * 学習した日の一覧から、現在の連続日数と最長記録を求める。
 * 今日まだ学習していなくても、昨日まで続いていれば途切れていないとみなす
 */
export const calculateStreak = (studyDates: readonly string[], today: string): StreakSummary => {
  const dates = [...new Set(studyDates)].sort()
  if (dates.length === 0) return { current: 0, longest: 0 }

  let longest = 1
  let run = 1
  for (let index = 1; index < dates.length; index++) {
    run = countDaysBetween(dates[index - 1], dates[index]) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
  }

  /**
   * 今日より後の日付（タイムゾーンを西に変えた直後に起こりうる）は今日と同じく「続いている」扱い
   */
  const isAlive = dates[dates.length - 1] >= addDaysToDate(today, -1)
  return { current: isAlive ? run : 0, longest }
}

/**
 * 1 日の学習秒数をカレンダーの色の段階にする（0 / 〜5 分 / 〜15 分 / 〜30 分 / 30 分超）
 */
export const convertStudySecondsToLevel = (seconds: number): CalendarLevel => {
  if (seconds <= 0) return 0
  const index = LEVEL_UPPER_SECONDS.findIndex((upper) => seconds <= upper)
  return (index === -1 ? 4 : index + 1) as CalendarLevel
}

/**
 * 今日を含む週（月曜始まり）の範囲
 */
export const getWeekRange = (today: string): WeekRange => {
  const mondayOffset = (new Date(convertDateToUtcMilliseconds(today)).getUTCDay() + 6) % 7
  const start = addDaysToDate(today, -mondayOffset)
  return { end: addDaysToDate(start, 6), start }
}
