import { getAdminPassageStats } from "../../../src/service/admin-stats-service"

import { buildPassageStatsRow, buildQuestionStatsRow, createMockAdminStatsRepository, FIXED_NOW } from "./fixtures"

describe("getAdminPassageStats", () => {
  describe("正常系", () => {
    it("設問ごとに、選択肢・未回答の割合と正答率を解答の数で割り、要確認の印を付ける", async () => {
      const adminStatsRepository = createMockAdminStatsRepository()
      adminStatsRepository.findPassageStatsById.mockResolvedValue(buildPassageStatsRow({ solvedAttempts: 10 }))
      adminStatsRepository.findQuestionStats.mockResolvedValue([
        buildQuestionStatsRow({ answerCount: 10, choiceCounts: [5, 4, 1, 0], correctCount: 4 }),
        buildQuestionStatsRow({ id: 572, answerCount: 10, choiceCounts: [1, 7, 0, 0], correctCount: 7, orderIndex: 1, unansweredCount: 2 }),
      ])

      const result = await getAdminPassageStats(57, "30d", { adminStatsRepository }, { now: FIXED_NOW })

      expect(adminStatsRepository.findPassageStatsById).toHaveBeenCalledWith(57, { from: new Date("2026-09-15T15:00:00.000Z"), to: FIXED_NOW })
      expect(result).toMatchObject({
        ok: true,
        value: {
          passage: { id: 57 },
          period: "30d",
          questions: [
            { id: 571, choiceRates: [0.5, 0.4, 0.1, 0], correctRate: 0.4, needsReview: true, unansweredRate: 0 },
            { id: 572, choiceRates: [0.1, 0.7, 0, 0], correctRate: 0.7, needsReview: false, unansweredRate: 0.2 },
          ],
        },
      })
    })
  })

  describe("異常系", () => {
    it("問題が無ければ 404", async () => {
      const adminStatsRepository = createMockAdminStatsRepository()

      const result = await getAdminPassageStats(999, "30d", { adminStatsRepository }, { now: FIXED_NOW })

      expect(result).toMatchObject({ error: { statusCode: 404 }, ok: false })
    })

    it("解答の数が 5 件未満の設問は要確認にせず、解答が無い設問の割合は null", async () => {
      const adminStatsRepository = createMockAdminStatsRepository()
      adminStatsRepository.findPassageStatsById.mockResolvedValue(buildPassageStatsRow())
      adminStatsRepository.findQuestionStats.mockResolvedValue([
        buildQuestionStatsRow({ answerCount: 4, choiceCounts: [4, 0, 0, 0] }),
        buildQuestionStatsRow({ id: 572 }),
      ])

      const result = await getAdminPassageStats(57, "30d", { adminStatsRepository }, { now: FIXED_NOW })

      expect(result).toMatchObject({
        ok: true,
        value: {
          questions: [
            { needsReview: false },
            { choiceRates: [null, null, null, null], correctRate: null, needsReview: false, unansweredRate: null },
          ],
        },
      })
    })
  })
})
