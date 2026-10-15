import { resolveStatsPeriod } from "../../src/lib/resolve-stats-period"

describe("resolveStatsPeriod", () => {
  describe("正常系", () => {
    it("7d は日本時間の今日を含む 7 日で、始まりは 6 日前の日本時間 0 時（日ごと）", () => {
      const now = new Date("2026-10-15T03:00:00.000Z")

      expect(resolveStatsPeriod("7d", now)).toEqual({
        bucket: "day",
        from: new Date("2026-10-08T15:00:00.000Z"),
        fromDate: "2026-10-09",
        to: now,
        toDate: "2026-10-15",
      })
    })

    it("30d は今日を含む 30 日", () => {
      const range = resolveStatsPeriod("30d", new Date("2026-10-15T03:00:00.000Z"))

      expect(range).toMatchObject({ bucket: "day", fromDate: "2026-09-16", toDate: "2026-10-15" })
    })

    it("all は始まりが無く（呼び出し側が最初の登録日で埋める）、週ごと", () => {
      const now = new Date("2026-10-15T03:00:00.000Z")

      expect(resolveStatsPeriod("all", now)).toEqual({ bucket: "week", from: null, fromDate: null, to: now, toDate: "2026-10-15" })
    })
  })

  describe("異常系", () => {
    it("日本時間の 0 時の前後（UTC 14:59 / 15:00）で今日が変わる", () => {
      expect(resolveStatsPeriod("7d", new Date("2026-10-14T14:59:59.999Z")).toDate).toBe("2026-10-14")
      expect(resolveStatsPeriod("7d", new Date("2026-10-14T15:00:00.000Z")).toDate).toBe("2026-10-15")
    })
  })
})
