import { getUserCalendar } from "../../../src/service/learning-record-service"

import { createMockLearningRecordRepository, createMockUserRepository, FIXED_NOW, USER } from "./fixtures"

const setup = () => {
  const learningRecordRepository = createMockLearningRecordRepository()
  const userRepository = createMockUserRepository()
  userRepository.findById.mockResolvedValue(USER)
  return { learningRecordRepository, userRepository }
}

/**
 * Asia/Tokyo で 2026-10-12（月曜）の 00:30
 */
const MONDAY_NOW = new Date("2026-10-11T15:30:00.000Z")

describe("getUserCalendar", () => {
  describe("正常系", () => {
    it("期間を省略すると、今日が日曜なら今日までの 366 日（今日の 365 日前から）", async () => {
      const repo = setup()

      const result = await getUserCalendar(USER.id, {}, repo, { now: FIXED_NOW })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toMatchObject({ from: "2025-10-11", to: "2026-10-11", today: "2026-10-11" })
        expect(result.value.days).toHaveLength(366)
      }
      expect(repo.learningRecordRepository.summarizeByDate).toHaveBeenCalledWith(USER.id, { from: "2025-10-11", to: "2026-10-11" })
    })

    it("期間を省略すると、今日が月曜なら今日までの 365 日（53 列目の月曜の 52 週前の月曜から）", async () => {
      const repo = setup()

      const result = await getUserCalendar(USER.id, {}, repo, { now: MONDAY_NOW })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toMatchObject({ from: "2025-10-13", to: "2026-10-12", today: "2026-10-12" })
        expect(result.value.days).toHaveLength(365)
      }
    })

    it("from〜to の全日を日付の昇順で返し、学習していない日は 0 で、学習秒数から色の段階を付ける", async () => {
      const repo = setup()
      repo.learningRecordRepository.summarizeByDate.mockResolvedValue([
        { attemptCount: 1, correctCount: 3, date: "2026-10-06", questionCount: 4, studySeconds: 300 },
        { attemptCount: 2, correctCount: 5, date: "2026-10-08", questionCount: 8, studySeconds: 1801 },
      ])

      const result = await getUserCalendar(USER.id, { from: "2026-10-05", to: "2026-10-08" }, repo, { now: FIXED_NOW })

      expect(result).toEqual({
        ok: true,
        value: {
          days: [
            { attemptCount: 0, correctCount: 0, date: "2026-10-05", level: 0, questionCount: 0, studySeconds: 0 },
            { attemptCount: 1, correctCount: 3, date: "2026-10-06", level: 1, questionCount: 4, studySeconds: 300 },
            { attemptCount: 0, correctCount: 0, date: "2026-10-07", level: 0, questionCount: 0, studySeconds: 0 },
            { attemptCount: 2, correctCount: 5, date: "2026-10-08", level: 4, questionCount: 8, studySeconds: 1801 },
          ],
          from: "2026-10-05",
          to: "2026-10-08",
          today: "2026-10-11",
        },
      })
      expect(repo.learningRecordRepository.summarizeByDate).toHaveBeenCalledWith(USER.id, { from: "2026-10-05", to: "2026-10-08" })
    })

    it("to が未来の日（月表示の月末）でもその日まで返す", async () => {
      const repo = setup()

      const result = await getUserCalendar(USER.id, { from: "2026-10-01", to: "2026-10-31" }, repo, { now: FIXED_NOW })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.days).toHaveLength(31)
        expect(result.value.days[30].date).toBe("2026-10-31")
      }
    })

    it.each([
      ["366 日（上限ちょうど）", "2025-10-11", "2026-10-11", 366],
      ["1 日（from と to が同じ日）", "2026-10-11", "2026-10-11", 1],
      ["うるう日を含む 366 日", "2028-01-01", "2028-12-31", 366],
    ])("期間が %s は ok", async (_label, from, to, dayCount) => {
      const repo = setup()

      const result = await getUserCalendar(USER.id, { from, to }, repo, { now: FIXED_NOW })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.days).toHaveLength(dayCount)
      }
    })
  })

  describe("異常系", () => {
    it.each([
      ["367 日（上限 + 1）", { from: "2025-10-10", to: "2026-10-11" }],
      ["from が to より後", { from: "2026-10-12", to: "2026-10-11" }],
      ["from だけ", { from: "2026-10-01" }],
      ["to だけ", { to: "2026-10-31" }],
    ])("%s は BAD_REQUEST（400）で、集計を読まない", async (_label, range) => {
      const repo = setup()

      const result = await getUserCalendar(USER.id, range, repo, { now: FIXED_NOW })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
      }
      expect(repo.learningRecordRepository.summarizeByDate).not.toHaveBeenCalled()
    })

    it("ユーザーが存在しなければ UNAUTHORIZED（401）で、集計を読まない", async () => {
      const repo = setup()
      repo.userRepository.findById.mockResolvedValue(null)

      const result = await getUserCalendar(999, {}, repo, { now: FIXED_NOW })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(repo.learningRecordRepository.summarizeByDate).not.toHaveBeenCalled()
    })
  })
})
