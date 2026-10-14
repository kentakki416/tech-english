/**
 * ユーザーのタイムゾーン（users.timezone。IANA 名）での日時の表し方。
 * 提出の study_date（reading-practice）と、学習記録の「今日」（learning-record）が使う
 */

/**
 * ユーザーのタイムゾーンでの日付（YYYY-MM-DD）。formatToParts で year / month / day を取り出して組み立てる
 * （ロケールごとの区切り文字や並び順に依存しないため）。タイムゾーン名が不正なら RangeError を throw する
 */
export const formatDateInTimeZone = (instant: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(instant)
  const findPart = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((part) => part.type === type)?.value
    if (value === undefined) throw new Error(`Missing ${type} in formatted date: timeZone=${timeZone}`)
    return value
  }
  return `${findPart("year")}-${findPart("month")}-${findPart("day")}`
}
