import { getVocabularySession } from "../../../src/service/vocabulary-service"

import { buildEncounter, createMockUserRepository, createMockVocabularyRepository, FIXED_NOW, USER } from "./fixtures"

const buildDueCards = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    card: { dueDate: "2026-10-15", id: index + 1, lemma: `due-${index}`, stage: index % 4 },
    encounter: buildEncounter(`due-${index}`),
  }))

describe("getVocabularySession", () => {
  describe("正常系", () => {
    it("今日の復習が 10 枚なら新しい単語を引かない", async () => {
      const userRepository = createMockUserRepository()
      const vocabularyRepository = createMockVocabularyRepository()
      vocabularyRepository.findDueCards.mockResolvedValue(buildDueCards(10))

      const result = await getVocabularySession(USER.id, { userRepository, vocabularyRepository }, { now: FIXED_NOW })

      expect(result.ok && result.value.cards).toHaveLength(10)
      expect(vocabularyRepository.findNewEncounters).not.toHaveBeenCalled()
    })

    it("今日の復習が 3 枚なら新しい単語を 7 件引き、復習 → 新しい単語の順に並べる（新しい単語の段階は null）", async () => {
      const userRepository = createMockUserRepository()
      const vocabularyRepository = createMockVocabularyRepository()
      vocabularyRepository.findDueCards.mockResolvedValue(buildDueCards(3))
      vocabularyRepository.findNewEncounters.mockResolvedValue([buildEncounter("logic")])

      const result = await getVocabularySession(USER.id, { userRepository, vocabularyRepository }, { now: FIXED_NOW })

      expect(vocabularyRepository.findNewEncounters).toHaveBeenCalledWith(USER.id, 7)
      expect(result.ok && result.value.cards.map((card) => [card.lemma, card.stage])).toEqual([
        ["due-0", 0],
        ["due-1", 1],
        ["due-2", 2],
        ["logic", null],
      ])
    })

    it.each([
      ["Asia/Tokyo", "2026-10-15"],
      ["UTC", "2026-10-14"],
    ])("今日は users.timezone（%s）で求める（%s）", async (timezone, today) => {
      const userRepository = createMockUserRepository()
      userRepository.findById.mockResolvedValue({ ...USER, timezone })
      const vocabularyRepository = createMockVocabularyRepository()

      const result = await getVocabularySession(USER.id, { userRepository, vocabularyRepository }, { now: FIXED_NOW })

      expect(result).toEqual({ ok: true, value: { cards: [], today } })
      expect(vocabularyRepository.findDueCards).toHaveBeenCalledWith(USER.id, today, 10)
    })

    it("中身を組み立てられない材料（意味が無い）は飛ばす", async () => {
      const userRepository = createMockUserRepository()
      const vocabularyRepository = createMockVocabularyRepository()
      vocabularyRepository.findNewEncounters.mockResolvedValue([buildEncounter("logic", { dictionaryMeaningJa: null }), buildEncounter("effect")])

      const result = await getVocabularySession(USER.id, { userRepository, vocabularyRepository }, { now: FIXED_NOW })

      expect(result.ok && result.value.cards.map((card) => card.lemma)).toEqual(["effect"])
    })
  })

  describe("異常系", () => {
    it("ユーザーが無ければ 401 で、単語帳のリポジトリを呼ばない", async () => {
      const userRepository = createMockUserRepository()
      userRepository.findById.mockResolvedValue(null)
      const vocabularyRepository = createMockVocabularyRepository()

      const result = await getVocabularySession(USER.id, { userRepository, vocabularyRepository }, { now: FIXED_NOW })

      expect(result).toMatchObject({ error: { statusCode: 401, type: "UNAUTHORIZED" }, ok: false })
      expect(vocabularyRepository.findDueCards).not.toHaveBeenCalled()
    })

    it("リポジトリが throw したらそのまま reject する", async () => {
      const userRepository = createMockUserRepository()
      const vocabularyRepository = createMockVocabularyRepository()
      vocabularyRepository.findDueCards.mockRejectedValue(new Error("Database connection failed"))

      await expect(getVocabularySession(USER.id, { userRepository, vocabularyRepository }, { now: FIXED_NOW })).rejects.toThrow()
    })
  })
})
