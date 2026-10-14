import { getAttempt } from "../../../src/service/attempt-service"
import { createMockPassageRepository, createMockReadingAttemptRepository } from "../../fixture/passage-repository-mock"

import {
  ALIVE_SINCE,
  buildAttempt,
  buildAttemptContent,
  buildExpectedSubmittedView,
  buildStoredAnswers,
  buildStoredWordLookups,
  buildSubmittedAttempt,
  EXPECTED_ATTRIBUTION,
  FIXED_NOW,
} from "./fixtures"

const passageRepository = createMockPassageRepository()
const readingAttemptRepository = createMockReadingAttemptRepository()
const repo = { passageRepository, readingAttemptRepository }

const INPUT = { attemptId: 301, now: FIXED_NOW, userId: 7 }

const PRIMARY = { fromPrimary: true }

const EXPECTED_PASSAGE = { id: 1, difficulty: 2, title: "Synchronizing with Effects", wordCount: 60 }

describe("getAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readingAttemptRepository.expireStale.mockResolvedValue(0)
    passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent())
  })

  describe("正常系", () => {
    it("期限内の挑戦中は解答中の形を返す。期限切れの更新を自分の挑戦を読むより先に呼び、挑戦は primary から読む", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildAttempt({ passageId: 1 }))

      const result = await getAttempt(INPUT, repo)

      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          id: 301,
          attribution: EXPECTED_ATTRIBUTION,
          expiresAt: new Date("2026-10-13T10:00:00.000Z"),
          passage: EXPECTED_PASSAGE,
          serverNow: FIXED_NOW,
          startedAt: new Date("2026-10-12T10:00:00.000Z"),
          status: "in_progress",
          timeLimitSeconds: 180,
        }),
      })
      expect(result.ok && result.value.status === "in_progress" && result.value.glossary.map((entry) => entry.id)).toEqual([101, 103])
      expect(readingAttemptRepository.expireStale).toHaveBeenCalledWith(7, ALIVE_SINCE)
      expect(readingAttemptRepository.findByIdForUser).toHaveBeenCalledWith(301, 7, PRIMARY)
      expect(passageRepository.findAttemptContentById).toHaveBeenCalledWith(1)
      const [expireOrder] = readingAttemptRepository.expireStale.mock.invocationCallOrder
      const [findOrder] = readingAttemptRepository.findByIdForUser.mock.invocationCallOrder
      expect(expireOrder).toBeLessThan(findOrder ?? 0)
    })

    it("非公開に戻された問題の挑戦中も解答中の形を返す", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent({ status: "draft" }))
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildAttempt())

      const result = await getAttempt(INPUT, repo)

      expect(result.ok && result.value.status).toBe("in_progress")
    })

    it("期限切れの挑戦は id・問題・開始日時だけの期限切れの形を返す", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(
        buildAttempt({ startedAt: new Date("2026-10-01T00:00:00.000Z"), status: "expired" }),
      )

      const result = await getAttempt(INPUT, repo)

      expect(result).toEqual({
        ok: true,
        value: { id: 301, passage: EXPECTED_PASSAGE, startedAt: new Date("2026-10-01T00:00:00.000Z"), status: "expired" },
      })
    })

    it("提出済みの挑戦は保存済みの回答と調べた単語から結果の形を返す（提出の直後を見失わないよう primary から読む）", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildSubmittedAttempt())
      readingAttemptRepository.findAnswersByAttemptId.mockResolvedValue(buildStoredAnswers())
      readingAttemptRepository.findWordLookupsWithMeaning.mockResolvedValue(buildStoredWordLookups())

      const result = await getAttempt(INPUT, repo)

      expect(result).toEqual({ ok: true, value: buildExpectedSubmittedView() })
      expect(readingAttemptRepository.findByIdForUser).toHaveBeenCalledWith(301, 7, PRIMARY)
      expect(readingAttemptRepository.findAnswersByAttemptId).toHaveBeenCalledWith(301, PRIMARY)
      expect(readingAttemptRepository.findWordLookupsWithMeaning).toHaveBeenCalledWith(301, PRIMARY)
    })

    it("提出後に正解が直された設問は、正誤を保存値のまま isAnswerKeyChanged を true にする", async () => {
      const content = buildAttemptContent()
      /**
       * 保存した回答は 201 が 1 を選んで正解、202 が 0 を選んで不正解、203 が未回答。
       * 201 の正解を 2 に、202 の正解を 0 に、203 の正解を 0 に直す
       */
      const correctedChoiceIndexes = new Map([[201, 2], [202, 0], [203, 0]])
      passageRepository.findAttemptContentById.mockResolvedValue({
        ...content,
        questions: content.questions.map((question) => ({
          ...question,
          correctChoiceIndex: correctedChoiceIndexes.get(question.id) ?? question.correctChoiceIndex,
        })),
      })
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildSubmittedAttempt())
      readingAttemptRepository.findAnswersByAttemptId.mockResolvedValue(buildStoredAnswers())
      readingAttemptRepository.findWordLookupsWithMeaning.mockResolvedValue([])

      const result = await getAttempt(INPUT, repo)

      expect(result.ok && result.value.status === "submitted" && result.value.correctCount).toBe(1)
      expect(
        result.ok && result.value.status === "submitted" && result.value.questions.map(
          ({ correctChoiceIndex, id, isAnswerKeyChanged, isCorrect, selectedChoiceIndex }) =>
            ({ correctChoiceIndex, id, isAnswerKeyChanged, isCorrect, selectedChoiceIndex }),
        ),
      ).toEqual([
        { correctChoiceIndex: 2, id: 201, isAnswerKeyChanged: true, isCorrect: true, selectedChoiceIndex: 1 },
        { correctChoiceIndex: 0, id: 202, isAnswerKeyChanged: true, isCorrect: false, selectedChoiceIndex: 0 },
        { correctChoiceIndex: 0, id: 203, isAnswerKeyChanged: false, isCorrect: false, selectedChoiceIndex: null },
      ])
    })

    it.each([
      ["開始から 23:59:59.999（境界値）", "2026-10-12T00:00:00.001Z", "in_progress"],
      ["開始からちょうど 24 時間（境界値）", "2026-10-12T00:00:00.000Z", "expired"],
    ])("in_progress のまま読めても、%sなら %s の形を返す", async (_label, startedAt, status) => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildAttempt({ startedAt: new Date(startedAt) }))

      const result = await getAttempt(INPUT, repo)

      expect(result.ok && result.value.status).toBe(status)
    })
  })

  describe("異常系", () => {
    it("自分の挑戦が見つからなければ（他人の挑戦・存在しない ID）404 を返し、問題を読まない", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(null)

      const result = await getAttempt(INPUT, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
      expect(passageRepository.findAttemptContentById).not.toHaveBeenCalled()
    })

    it("提出済みなのに回答が無い設問があれば throw する", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildSubmittedAttempt())
      readingAttemptRepository.findAnswersByAttemptId.mockResolvedValue(buildStoredAnswers().slice(0, 2))
      readingAttemptRepository.findWordLookupsWithMeaning.mockResolvedValue([])

      await expect(getAttempt(INPUT, repo)).rejects.toThrow()
    })

    it("挑戦の問題が見つからなければ throw する", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildAttempt())
      passageRepository.findAttemptContentById.mockResolvedValue(null)

      await expect(getAttempt(INPUT, repo)).rejects.toThrow()
    })
  })
})
