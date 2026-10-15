/**
 * タイムゾーン（IANA 名）での日時の表し方。ユーザーのタイムゾーン（users.timezone）での提出の study_date（reading-practice）と
 * 学習記録の「今日」（learning-record）、admin のダッシュボードの日本時間の日（admin-dashboard）が使う
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

/**
 * ユーザーのタイムゾーンでの時刻（HH:mm。24 時間制で 0 時は 00）。学習記録の挑戦の一覧の提出時刻に使う。
 * hourCycle: "h23" を指定しないと、en-US では 0 時が 24 になる実装がある。タイムゾーン名が不正なら RangeError を throw する
 */
export const formatTimeInTimeZone = (instant: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone }).formatToParts(instant)
  const findPart = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((part) => part.type === type)?.value
    if (value === undefined) throw new Error(`Missing ${type} in formatted time: timeZone=${timeZone}`)
    return value
  }
  return `${findPart("hour")}:${findPart("minute")}`
}

/**
 * UTC からのずれが utcOffset（例 "+09:00"）の地域での、日付（YYYY-MM-DD）の 0 時の時刻。夏時間の無いタイムゾーンにだけ使う
 * （admin のダッシュボードの期間の始まり。@repo/domain の ADMIN_STATS_UTC_OFFSET）
 */
export const convertDateToStartInstant = (date: string, utcOffset: string): Date => new Date(`${date}T00:00:00${utcOffset}`)
