/**
 * 日時は既定で日本時間で表示する。Server Component は UTC で動くため、タイムゾーンを明示する
 * （明示しておけば Server と Client で同じ文字列になり、hydration の不一致も起きない）
 */
const DEFAULT_TIME_ZONE = "Asia/Tokyo"

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>()

/**
 * タイムゾーンごとの書式。作るのが重いので使い回す
 */
const getDateTimeFormat = (timeZone: string): Intl.DateTimeFormat => {
  const cached = dateTimeFormats.get(timeZone)
  if (cached) return cached
  const format = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  })
  dateTimeFormats.set(timeZone, format)
  return format
}

/**
 * ISO 8601 の日時を `2026-10-10 03:00` の形にする（timeZone を省くと日本時間。ユーザーの学習履歴はユーザーのタイムゾーンを渡す）
 */
export const formatDateTime = (iso: string, timeZone: string = DEFAULT_TIME_ZONE): string => {
  const parts = Object.fromEntries(
    getDateTimeFormat(timeZone).formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

/**
 * ISO 8601 の日時を `2026-10-10`（日本時間の日付）の形にする
 */
export const formatDate = (iso: string): string => formatDateTime(iso).slice(0, 10)
