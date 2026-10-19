import { getUserAttempts } from "../../../src/service/learning-record-service"

import { buildSubmittedAttempt, createMockLearningRecordRepository, createMockUserRepository, USER } from "./fixtures"

const setup = () => {
  const learningRecordRepository = createMockLearningRecordRepository()
  const userRepository = createMockUserRepository()
  userRepository.findById.mockResolvedValue(USER)
  return { learningRecordRepository, userRepository }
}

describe("getUserAttempts", () => {
  describe("正常系", () => {
    it("limit + 1 件を読み、limit + 1 件返れば limit 件を返して nextCursor を最後に返した行の id にする", async () => {
      const repo = setup()
      repo.learningRecordRepository.findSubmittedAttempts.mockResolvedValue([
        buildSubmittedAttempt({ id: 305 }),
        buildSubmittedAttempt({ id: 304 }),
        buildSubmittedAttempt({ id: 303 }),
      ])

      const result = await getUserAttempts(USER.id, { cursor: 306, date: "2026-10-10", limit: 2 }, repo)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.attempts.map((attempt) => attempt.id)).toEqual([305, 304])
        expect(result.value.nextCursor).toBe(304)
      }
      expect(repo.learningRecordRepository.findSubmittedAttempts).toHaveBeenCalledWith(USER.id, {
        cursor: 306,
        date: "2026-10-10",
        limit: 3,
      })
    })

    it.each([
      ["limit 件ちょうど（境界値）", 2],
      ["limit 件より少ない", 1],
      ["0 件", 0],
    ])("%s なら nextCursor は null", async (_label, count) => {
      const repo = setup()
      repo.learningRecordRepository.findSubmittedAttempts.mockResolvedValue(
        [buildSubmittedAttempt({ id: 305 }), buildSubmittedAttempt({ id: 304 })].slice(0, count),
      )

      const result = await getUserAttempts(USER.id, { limit: 2 }, repo)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.attempts).toHaveLength(count)
        expect(result.value.nextCursor).toBeNull()
      }
    })

    it("提出時刻をユーザーのタイムゾーンの HH:mm にし、段落の和訳・設問の和訳・単語の意味・読み上げのどれかを使っていればアシストあり", async () => {
      const repo = setup()
      repo.userRepository.findById.mockResolvedValue({ ...USER, timezone: "America/Los_Angeles" })
      repo.learningRecordRepository.findSubmittedAttempts.mockResolvedValue([
        buildSubmittedAttempt({ id: 304, listenedBlockCount: 1, submittedAt: new Date("2026-10-10T07:01:00.000Z") }),
        buildSubmittedAttempt({ id: 303, submittedAt: new Date("2026-10-10T07:00:00.000Z"), translatedBlockCount: 1 }),
        buildSubmittedAttempt({ id: 302, submittedAt: new Date("2026-10-10T06:59:00.000Z"), wordLookupCount: 1 }),
        buildSubmittedAttempt({ id: 305, submittedAt: new Date("2026-10-10T06:58:00.000Z"), translatedQuestionCount: 1 }),
        buildSubmittedAttempt({ id: 301, submittedAt: new Date("2026-10-09T19:05:00.000Z") }),
      ])

      const result = await getUserAttempts(USER.id, { limit: 20 }, repo)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.attempts.map((attempt) => [attempt.id, attempt.submittedTime, attempt.usedAssist])).toEqual([
          [304, "00:01", true],
          [303, "00:00", true],
          [302, "23:59", true],
          [305, "23:58", true],
          [301, "12:05", false],
        ])
        expect(result.value.attempts[4]).toEqual({
          id: 301,
          correctCount: 3,
          elapsedSeconds: 312,
          isOvertime: false,
          passageId: 11,
          questionCount: 4,
          studyDate: "2026-10-10",
          submittedAt: new Date("2026-10-09T19:05:00.000Z"),
          submittedTime: "12:05",
          title: "Synchronizing with Effects",
          usedAssist: false,
        })
      }
    })
  })

  describe("異常系", () => {
    it("ユーザーが存在しなければ UNAUTHORIZED（401）で、一覧を読まない", async () => {
      const repo = setup()
      repo.userRepository.findById.mockResolvedValue(null)

      const result = await getUserAttempts(999, { limit: 20 }, repo)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(repo.learningRecordRepository.findSubmittedAttempts).not.toHaveBeenCalled()
    })
  })
})
