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
