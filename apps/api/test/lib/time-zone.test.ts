import { formatDateInTimeZone, formatTimeInTimeZone } from "../../src/lib/time-zone"

describe("formatDateInTimeZone", () => {
  describe("正常系", () => {
    it.each([
      ["Asia/Tokyo の日付の終わり（境界値: JST 23:59:59.999）", "2026-10-10T14:59:59.999Z", "Asia/Tokyo", "2026-10-10"],
      ["Asia/Tokyo の日付の始まり（境界値: JST 0:00）", "2026-10-10T15:00:00.000Z", "Asia/Tokyo", "2026-10-11"],
      ["UTC の日付の終わり（境界値）", "2026-10-10T23:59:59.999Z", "UTC", "2026-10-10"],
      ["UTC の日付の始まり（境界値）", "2026-10-11T00:00:00.000Z", "UTC", "2026-10-11"],
      ["月と日を 0 埋めする", "2026-01-05T03:00:00.000Z", "UTC", "2026-01-05"],
      ["America/Los_Angeles の夏時間の最終日の始まり（PDT の 0:00 = 07:00Z）", "2026-11-01T07:00:00.000Z", "America/Los_Angeles", "2026-11-01"],
      ["夏時間の最終日の直前（PDT の 23:59:59.999）", "2026-11-01T06:59:59.999Z", "America/Los_Angeles", "2026-10-31"],
      ["夏時間が終わった翌日の始まり（PST の 0:00 = 08:00Z）", "2026-11-02T08:00:00.000Z", "America/Los_Angeles", "2026-11-02"],
      ["夏時間が終わった日の終わり（PST の 23:59:59.999 = 翌 07:59:59.999Z）", "2026-11-02T07:59:59.999Z", "America/Los_Angeles", "2026-11-01"],
      ["夏時間が始まった翌日の始まり（PDT の 0:00 = 07:00Z）", "2026-03-09T07:00:00.000Z", "America/Los_Angeles", "2026-03-09"],
      ["夏時間が始まった日の終わり（PDT の 23:59:59.999）", "2026-03-09T06:59:59.999Z", "America/Los_Angeles", "2026-03-08"],
    ])("%s", (_label, instant, timeZone, expected) => {
      expect(formatDateInTimeZone(new Date(instant), timeZone)).toBe(expected)
    })
  })

  describe("異常系", () => {
    it("タイムゾーン名が不正なら RangeError を throw する", () => {
      expect(() => formatDateInTimeZone(new Date("2026-10-10T00:00:00.000Z"), "Mars/Olympus_Mons")).toThrow(RangeError)
    })
  })
})

describe("formatTimeInTimeZone", () => {
  describe("正常系", () => {
    it.each([
      ["Asia/Tokyo の 0 時は 00（24 にしない）", "2026-10-10T15:00:00.000Z", "Asia/Tokyo", "00:00"],
      ["Asia/Tokyo の日付の終わり", "2026-10-10T14:59:59.999Z", "Asia/Tokyo", "23:59"],
      ["秒は切り捨てる", "2026-10-09T23:14:59.999Z", "Asia/Tokyo", "08:14"],
      ["時と分を 0 埋めする", "2026-10-10T03:05:00.000Z", "UTC", "03:05"],
      ["America/Los_Angeles の夏時間（PDT = UTC-7）", "2026-10-10T19:30:00.000Z", "America/Los_Angeles", "12:30"],
      ["America/Los_Angeles の標準時（PST = UTC-8）", "2026-12-10T19:30:00.000Z", "America/Los_Angeles", "11:30"],
    ])("%s", (_label, instant, timeZone, expected) => {
      expect(formatTimeInTimeZone(new Date(instant), timeZone)).toBe(expected)
    })
  })

  describe("異常系", () => {
    it("タイムゾーン名が不正なら RangeError を throw する", () => {
      expect(() => formatTimeInTimeZone(new Date("2026-10-10T00:00:00.000Z"), "Mars/Olympus_Mons")).toThrow(RangeError)
    })
  })
})
