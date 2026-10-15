import { getAdminStatsOverview } from "../../../src/service/admin-stats-service"

import { createMockAdminStatsRepository, EMPTY_TOTALS, FIXED_NOW } from "./fixtures"

describe("getAdminStatsOverview", () => {
  describe("正常系", () => {
    it("30d は日本時間の 30 日前の 0 時から集計し、比率は合計から求める（日ごとの推移）", async () => {
      const adminStatsRepository = createMockAdminStatsRepository()
      adminStatsRepository.summarizeOverview.mockResolvedValue({
        ...EMPTY_TOTALS,
        activeUsers: 5,
        correctCount: 30,
        elapsedSecondsSum: 1200,
        listenedAttempts: 1,
        lookedUpAttempts: 3,
        newUsers: 2,
        overtimeAttempts: 2,
        questionCount: 40,
        solvedAttempts: 10,
        solvedUsers: 4,
        totalUsers: 20,
        translatedAttempts: 5,
      })

      const result = await getAdminStatsOverview("30d", { adminStatsRepository }, { now: FIXED_NOW })

      expect(adminStatsRepository.summarizeOverview).toHaveBeenCalledWith({ from: new Date("2026-09-15T15:00:00.000Z"), to: FIXED_NOW })
      expect(adminStatsRepository.findOverviewSeries).toHaveBeenCalledWith({ bucket: "day", fromDate: "2026-09-16", toDate: "2026-10-15" })
      expect(adminStatsRepository.findFirstUserCreatedAt).not.toHaveBeenCalled()
      expect(result).toEqual({
        ok: true,
        value: {
          activeUsers: 5,
          assistRates: { listened: 0.1, lookedUp: 0.3, translated: 0.5 },
          averageElapsedSeconds: 120,
          correctRate: 0.75,
          fromDate: "2026-09-16",
          newUsers: 2,
          overtimeRate: 0.2,
          period: "30d",
          series: { bucket: "day", points: [] },
          solvedAttempts: 10,
          solvedUsers: 4,
          toDate: "2026-10-15",
          totalUsers: 20,
        },
      })
    })

    it("all は最初のユーザーの登録日から。登録日が水曜でも、週ごとの推移の始まりと終わりはその週の月曜にそろえる", async () => {
      const adminStatsRepository = createMockAdminStatsRepository()
      adminStatsRepository.findFirstUserCreatedAt.mockResolvedValue(new Date("2026-04-08T03:00:00.000Z"))

      const result = await getAdminStatsOverview("all", { adminStatsRepository }, { now: FIXED_NOW })

      expect(adminStatsRepository.summarizeOverview).toHaveBeenCalledWith({ from: null, to: FIXED_NOW })
      expect(adminStatsRepository.findOverviewSeries).toHaveBeenCalledWith({ bucket: "week", fromDate: "2026-04-06", toDate: "2026-10-12" })
      expect(result).toMatchObject({ ok: true, value: { fromDate: "2026-04-08", series: { bucket: "week" }, toDate: "2026-10-15" } })
    })
  })

  describe("異常系", () => {
    it("誰も学習していなければ比率は null", async () => {
      const adminStatsRepository = createMockAdminStatsRepository()

      const result = await getAdminStatsOverview("7d", { adminStatsRepository }, { now: FIXED_NOW })

      expect(result).toMatchObject({
        ok: true,
        value: { assistRates: { listened: null, lookedUp: null, translated: null }, averageElapsedSeconds: null, correctRate: null, overtimeRate: null },
      })
    })

    it("all でユーザーがいなければ、始まりは今日", async () => {
      const adminStatsRepository = createMockAdminStatsRepository()

      const result = await getAdminStatsOverview("all", { adminStatsRepository }, { now: FIXED_NOW })

      expect(adminStatsRepository.findOverviewSeries).toHaveBeenCalledWith({ bucket: "week", fromDate: "2026-10-12", toDate: "2026-10-12" })
      expect(result).toMatchObject({ ok: true, value: { fromDate: "2026-10-15" } })
    })
  })
})
