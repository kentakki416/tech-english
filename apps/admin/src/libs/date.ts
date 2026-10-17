import { appConfig } from "@/config/app"

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>()

/**
 * タイムゾーンごとの書式。作るのが重いので使い回す
 */
const getDateTimeFormat = (timeZone: string): Intl.DateTimeFormat => {
  const cached = dateTimeFormats.get(timeZone)
  if (cached) return cached
  const format = new Intl.DateTimeFormat(appConfig.locale, {
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
 * 日時を timeZone の `2026-10-10 03:00` の形にする。
 * Server Component はサーバーのタイムゾーン（本番は UTC）で動くので、toLocaleString を直接使わずタイムゾーンを明示する
 * （明示しておけば Server と Client で同じ文字列になり、hydration の不一致も起きない）
 */
export const formatDateTime = (value: string | Date, timeZone: string = appConfig.timeZone): string => {
  const parts = Object.fromEntries(
    getDateTimeFormat(timeZone)
      .formatToParts(typeof value === "string" ? new Date(value) : value)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

/**
 * 日時を timeZone の日付 `2026-10-10` の形にする
 */
export const formatDate = (value: string | Date, timeZone: string = appConfig.timeZone): string =>
  formatDateTime(value, timeZone).slice(0, 10)

const relativeTimeFormatter = new Intl.RelativeTimeFormat(appConfig.locale, { numeric: "auto" })

/**
 * 日の単位は「昨日」「一昨日」ではなく「1 日前」の形で出す。経過時間で数えるので、暦の上の昨日とずれるため
 */
const dayFormatter = new Intl.RelativeTimeFormat(appConfig.locale, { numeric: "always" })

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 60 * 60
const SECONDS_PER_DAY = 60 * 60 * 24
/**
 * これより前は経過時間ではなく日時で出す
 */
const RELATIVE_TIME_LIMIT_DAYS = 30

/**
 * 今からの経過時間を「5 分前」「3 時間前」「2 日前」の形で出す。30 日より前は日時で出す。日時として読めなければ「-」
 */
export const formatRelativeTime = (value: string | Date, now: Date = new Date()): string => {
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return "-"
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
  if (seconds < SECONDS_PER_MINUTE) return relativeTimeFormatter.format(0, "second")
  if (seconds < SECONDS_PER_HOUR) return relativeTimeFormatter.format(-Math.floor(seconds / SECONDS_PER_MINUTE), "minute")
  if (seconds < SECONDS_PER_DAY) return relativeTimeFormatter.format(-Math.floor(seconds / SECONDS_PER_HOUR), "hour")
  const days = Math.floor(seconds / SECONDS_PER_DAY)
  if (days < RELATIVE_TIME_LIMIT_DAYS) return dayFormatter.format(-days, "day")
  return formatDateTime(date)
}
