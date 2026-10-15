import { getAdminPassageStatsList } from "../../../src/service/admin-stats-service"

import { buildPassageStatsRow, createMockAdminStatsRepository, FIXED_NOW } from "./fixtures"

describe("getAdminPassageStatsList", () => {
  const query = { limit: 50, order: "desc" as const, page: 3, period: "7d" as const, q: "own", sort: "solved_users" as const }

  describe("正常系", () => {
    it("page から offset を求め、期間で絞って Repository に渡し、各行の比率を求める", async () => {
      const adminStatsRepository = createMockAdminStatsRepository()
      adminStatsRepository.findPassageStats.mockResolvedValue({
        items: [buildPassageStatsRow({ correctCount: 6, elapsedSecondsSum: 600, questionCount: 8, solvedAttempts: 2, solvedUsers: 2 })],
        total: 101,
      })

      const result = await getAdminPassageStatsList(query, { adminStatsRepository }, { now: FIXED_NOW })

      expect(adminStatsRepository.findPassageStats).toHaveBeenCalledWith({
        from: new Date("2026-10-08T15:00:00.000Z"),
        limit: 50,
        offset: 100,
        order: "desc",
        q: "own",
        sort: "solved_users",
        to: FIXED_NOW,
      })
      expect(result).toMatchObject({
        ok: true,
        value: { items: [{ id: 57, averageElapsedSeconds: 300, correctRate: 0.75, solvedAttempts: 2 }], limit: 50, page: 3, total: 101 },
      })
    })
  })

  describe("異常系", () => {
    it("解かれていない問題の比率は null", async () => {
      const adminStatsRepository = createMockAdminStatsRepository()
      adminStatsRepository.findPassageStats.mockResolvedValue({ items: [buildPassageStatsRow()], total: 1 })

      const result = await getAdminPassageStatsList(query, { adminStatsRepository }, { now: FIXED_NOW })

      expect(result).toMatchObject({ ok: true, value: { items: [{ averageElapsedSeconds: null, correctRate: null, overtimeRate: null }] } })
    })
  })
})
