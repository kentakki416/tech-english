/**
 * 日時は日本時間で表示する。Server Component は UTC で動くため、タイムゾーンを明示する
 * （明示しておけば Server と Client で同じ文字列になり、hydration の不一致も起きない）
 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Tokyo",
  year: "numeric",
})

/**
 * ISO 8601 の日時を `2026-10-10 03:00`（日本時間）の形にする
 */
export const formatDateTime = (iso: string): string => {
  const parts = Object.fromEntries(
    DATE_TIME_FORMAT.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}
