import { getVocabularySummary } from "../../../src/service/vocabulary-service"

import { createMockUserRepository, createMockVocabularyRepository, FIXED_NOW, USER } from "./fixtures"

describe("getVocabularySummary", () => {
  describe("正常系", () => {
    it("users.timezone の今日で数を集め、そのまま返す", async () => {
      const userRepository = createMockUserRepository()
      const vocabularyRepository = createMockVocabularyRepository()
      const counts = { dueCount: 4, learningCount: 23, masteredCount: 41, newCount: 6, nextDueDate: "2026-10-16" }
      vocabularyRepository.summarize.mockResolvedValue(counts)

      const result = await getVocabularySummary(USER.id, { userRepository, vocabularyRepository }, { now: FIXED_NOW })

      expect(result).toEqual({ ok: true, value: counts })
      expect(vocabularyRepository.summarize).toHaveBeenCalledWith(USER.id, "2026-10-15")
    })
  })

  describe("異常系", () => {
    it("ユーザーが無ければ 401 で、単語帳のリポジトリを呼ばない", async () => {
      const userRepository = createMockUserRepository()
      userRepository.findById.mockResolvedValue(null)
      const vocabularyRepository = createMockVocabularyRepository()

      const result = await getVocabularySummary(USER.id, { userRepository, vocabularyRepository }, { now: FIXED_NOW })

      expect(result).toMatchObject({ error: { statusCode: 401, type: "UNAUTHORIZED" }, ok: false })
      expect(vocabularyRepository.summarize).not.toHaveBeenCalled()
    })

    it("リポジトリが throw したらそのまま reject する", async () => {
      const userRepository = createMockUserRepository()
      const vocabularyRepository = createMockVocabularyRepository()
      vocabularyRepository.summarize.mockRejectedValue(new Error("Database connection failed"))

      await expect(getVocabularySummary(USER.id, { userRepository, vocabularyRepository }, { now: FIXED_NOW })).rejects.toThrow()
    })
  })
})
