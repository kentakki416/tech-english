import type { VocabularyCard } from "@repo/domain"

import type { TransactionContext, TransactionRunner } from "../../../src/repository"
import { reviewVocabularyCard } from "../../../src/service/vocabulary-service"

import { createMockUserRepository, createMockVocabularyRepository, FIXED_NOW, USER } from "./fixtures"

const TX = {} as TransactionContext

/**
 * 渡された関数をそのまま呼ぶ transactionRunner
 */
const createTransactionRunner = () => ({
  run: vi.fn(async <T>(fn: (tx: TransactionContext) => Promise<T>) => fn(TX)) as TransactionRunner["run"],
})

const buildCard = (overrides: Partial<VocabularyCard> = {}): VocabularyCard => ({
  id: 11,
  dueDate: "2026-10-18",
  lastReviewedAt: FIXED_NOW,
  lemma: "opt out of",
  stage: 1,
  userId: USER.id,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
  ...overrides,
})

const INPUT = { activeSeconds: 8, clientReviewId: "7f1c1f9e-3c1f-4b8a-9d55-0a4c1d2e3f40", grade: "remembered" as const, lemma: "opt out of" }

const setup = () => {
  const userRepository = createMockUserRepository()
  const vocabularyRepository = createMockVocabularyRepository()
  vocabularyRepository.saveReview.mockImplementation(async (input) =>
    buildCard({ dueDate: input.dueDate, lemma: input.lemma, stage: input.stageAfter }))
  const transactionRunner = createTransactionRunner()
  return { repo: { transactionRunner, userRepository, vocabularyRepository }, transactionRunner, userRepository, vocabularyRepository }
}

describe("reviewVocabularyCard", () => {
  describe("正常系", () => {
    it("カードの無い見出し語で覚えたなら、段階 1・3 日後・今日の study_date で保存する（Asia/Tokyo の今日は 2026-10-15）", async () => {
      const { repo, vocabularyRepository } = setup()

      const result = await reviewVocabularyCard(USER.id, INPUT, repo, { now: FIXED_NOW })

      expect(result).toEqual({ ok: true, value: { dueDate: "2026-10-18", lemma: "opt out of", stage: 1 } })
      expect(vocabularyRepository.saveReview).toHaveBeenCalledWith({
        activeSeconds: 8,
        clientReviewId: INPUT.clientReviewId,
        dueDate: "2026-10-18",
        grade: "remembered",
        lemma: "opt out of",
        reviewedAt: FIXED_NOW,
        stageAfter: 1,
        stageBefore: null,
        studyDate: "2026-10-15",
        userId: USER.id,
      }, TX)
    })

    it.each([
      [2, "forgot" as const, 0, "2026-10-16"],
      [3, "remembered" as const, 4, null],
    ])("今日の分の段階 %d のカードで %s なら段階 %d・次は %s", async (stageBefore, grade, stageAfter, dueDate) => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.findCardByLemma.mockResolvedValue(buildCard({ dueDate: "2026-10-15", stage: stageBefore }))

      await reviewVocabularyCard(USER.id, { ...INPUT, grade }, repo, { now: FIXED_NOW })

      expect(vocabularyRepository.saveReview).toHaveBeenCalledWith(expect.objectContaining({ dueDate, stageAfter, stageBefore }), TX)
    })

    it("次に出す日を過ぎたカードも今日の分として保存する", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.findCardByLemma.mockResolvedValue(buildCard({ dueDate: "2026-10-01", stage: 1 }))

      await reviewVocabularyCard(USER.id, INPUT, repo, { now: FIXED_NOW })

      expect(vocabularyRepository.saveReview).toHaveBeenCalledWith(expect.objectContaining({ dueDate: "2026-10-22", stageAfter: 2, stageBefore: 1 }), TX)
    })

    it("次に出す日が明日のカード（今日の分ではない）には保存せず、今の状態を返す（境界値。戻るボタンで古い 1 回分を答え直したとき）", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.findCardByLemma.mockResolvedValue(buildCard({ dueDate: "2026-10-16", stage: 0 }))

      const result = await reviewVocabularyCard(USER.id, INPUT, repo, { now: FIXED_NOW })

      expect(result).toEqual({ ok: true, value: { dueDate: "2026-10-16", lemma: "opt out of", stage: 0 } })
      expect(vocabularyRepository.saveReview).not.toHaveBeenCalled()
    })

    it("覚えた単語（段階 4・次に出す日なし）には保存せず、今の状態を返す", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.findCardByLemma.mockResolvedValue(buildCard({ dueDate: null, stage: 4 }))

      const result = await reviewVocabularyCard(USER.id, INPUT, repo, { now: FIXED_NOW })

      expect(result).toEqual({ ok: true, value: { dueDate: null, lemma: "opt out of", stage: 4 } })
      expect(vocabularyRepository.saveReview).not.toHaveBeenCalled()
    })

    it("見出し語は小文字にして扱う", async () => {
      const { repo, vocabularyRepository } = setup()

      await reviewVocabularyCard(USER.id, { ...INPUT, lemma: "Effect" }, repo, { now: FIXED_NOW })

      expect(vocabularyRepository.findCardByLemma).toHaveBeenCalledWith(USER.id, "effect", TX)
    })

    it.each([
      [60, 60],
      [61, 60],
    ])("見ていた秒数 %d は %d で保存する（境界値）", async (activeSeconds, saved) => {
      const { repo, vocabularyRepository } = setup()

      await reviewVocabularyCard(USER.id, { ...INPUT, activeSeconds }, repo, { now: FIXED_NOW })

      expect(vocabularyRepository.saveReview).toHaveBeenCalledWith(expect.objectContaining({ activeSeconds: saved }), TX)
    })

    it("保存済みの client_review_id なら保存せず、そのカードの今の状態を返す", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.findReviewedCard.mockResolvedValue(buildCard({ dueDate: "2026-10-20", stage: 2 }))

      const result = await reviewVocabularyCard(USER.id, INPUT, repo, { now: FIXED_NOW })

      expect(result).toEqual({ ok: true, value: { dueDate: "2026-10-20", lemma: "opt out of", stage: 2 } })
      expect(vocabularyRepository.saveReview).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("ユーザーが無ければ 401 で、トランザクションを始めない", async () => {
      const { repo, transactionRunner, userRepository } = setup()
      userRepository.findById.mockResolvedValue(null)

      const result = await reviewVocabularyCard(USER.id, INPUT, repo, { now: FIXED_NOW })

      expect(result).toMatchObject({ error: { statusCode: 401 }, ok: false })
      expect(transactionRunner.run).not.toHaveBeenCalled()
    })

    it("ロックでユーザーが見つからなければ 401 で、保存しない", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.lockUserForReview.mockResolvedValue(false)

      const result = await reviewVocabularyCard(USER.id, INPUT, repo, { now: FIXED_NOW })

      expect(result).toMatchObject({ error: { statusCode: 401 }, ok: false })
      expect(vocabularyRepository.saveReview).not.toHaveBeenCalled()
    })

    it("カードが無く候補にも無ければ 404 で、保存しない", async () => {
      const { repo, vocabularyRepository } = setup()
      vocabularyRepository.hasEncounter.mockResolvedValue(false)

      const result = await reviewVocabularyCard(USER.id, INPUT, repo, { now: FIXED_NOW })

      expect(result).toMatchObject({ error: { statusCode: 404, type: "NOT_FOUND" }, ok: false })
      expect(vocabularyRepository.saveReview).not.toHaveBeenCalled()
    })
  })
})
