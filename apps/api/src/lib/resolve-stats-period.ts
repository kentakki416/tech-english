import { addDaysToDate, ADMIN_STATS_TIME_ZONE, type AdminStatsPeriod } from "@repo/domain"

import { convertTokyoDateToStartInstant, formatDateInTimeZone } from "./time-zone"

/**
 * 期間の範囲。from は日本時間の始まりの日の 0 時（全期間は null）、to は今。fromDate / toDate は日本時間の日付
 */
export type StatsPeriodRange = {
  bucket: "day" | "week"
  from: Date | null
  /**
   * 全期間は null（呼び出し側が最初のユーザーの登録日で埋める）
   */
  fromDate: string | null
  to: Date
  toDate: string
}

/**
 * 直近 N 日の期間の日数（今日を含む）
 */
const PERIOD_DAYS: Record<Exclude<AdminStatsPeriod, "all">, number> = { "30d": 30, "7d": 7 }

/**
 * 期間を、日本時間の今日を含む範囲にする。7d / 30d は日ごと、all は週ごと（admin-dashboard README「期間と日の区切り」）
 */
export const resolveStatsPeriod = (period: AdminStatsPeriod, now: Date): StatsPeriodRange => {
  const toDate = formatDateInTimeZone(now, ADMIN_STATS_TIME_ZONE)
  if (period === "all") {
    return { bucket: "week", from: null, fromDate: null, to: now, toDate }
  }
  const fromDate = addDaysToDate(toDate, -(PERIOD_DAYS[period] - 1))
  return { bucket: "day", from: convertTokyoDateToStartInstant(fromDate), fromDate, to: now, toDate }
}
