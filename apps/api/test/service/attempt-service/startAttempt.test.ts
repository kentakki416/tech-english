import { type InProgressAttemptView, startAttempt } from "../../../src/service/attempt-service"
import { createMockPassageRepository, createMockReadingAttemptRepository } from "../../fixture/passage-repository-mock"

import {
  ALIVE_SINCE,
  buildAttempt,
  buildAttemptContent,
  createMockUserRepository,
  EXPECTED_ATTRIBUTION,
  EXPECTED_BLOCKS_WITHOUT_SEGMENTS,
  EXPECTED_QUESTIONS,
  FIXED_NOW,
  USER,
} from "./fixtures"

const passageRepository = createMockPassageRepository()
const readingAttemptRepository = createMockReadingAttemptRepository()
const userRepository = createMockUserRepository()
const repo = { passageRepository, readingAttemptRepository, userRepository }

const INPUT = { now: FIXED_NOW, passageId: 1, userId: 7 }

const PRIMARY = { fromPrimary: true }

const extractView = (result: Awaited<ReturnType<typeof startAttempt>>): InProgressAttemptView => {
  if (!result.ok) throw new Error("Expected ok result")
  return result.value.view
}

describe("startAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userRepository.findById.mockResolvedValue(USER)
    readingAttemptRepository.expireStale.mockResolvedValue(0)
  })

  describe("正常系", () => {
    it("挑戦中が無ければ公開中の問題の制限時間で挑戦中を作り、isCreated: true で解答中の形を返す", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent({ timeLimitSeconds: 240 }))
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(null)
      readingAttemptRepository.createInProgress.mockResolvedValue(
        buildAttempt({ id: 302, startedAt: FIXED_NOW, timeLimitSeconds: 240 }),
      )

      const result = await startAttempt(INPUT, repo)

      expect(result).toEqual({
        ok: true,
        value: {
          isCreated: true,
          view: {
            id: 302,
            attribution: EXPECTED_ATTRIBUTION,
            blocks: EXPECTED_BLOCKS_WITHOUT_SEGMENTS.map((block) => ({ ...block, segments: expect.any(Array) })),
            expiresAt: new Date("2026-10-14T00:00:00.000Z"),
            glossary: [
              {
                id: 101,
                lemma: "stay in sync with",
                meaningJa: "〜と同期した状態を保つ",
                noteJa: null,
                partOfSpeech: "熟語",
                surface: "stay in sync with",
              },
              {
                id: 103,
                lemma: "opt out of",
                meaningJa: "〜をやめる、（既定の動作を）無効にする",
                noteJa: null,
                partOfSpeech: "熟語",
                surface: "opt out of",
              },
            ],
            passage: { id: 1, difficulty: 2, title: "Synchronizing with Effects", wordCount: 60 },
            questions: EXPECTED_QUESTIONS,
            serverNow: FIXED_NOW,
            startedAt: FIXED_NOW,
            status: "in_progress",
            timeLimitSeconds: 240,
          },
        },
      })
      expect(readingAttemptRepository.createInProgress).toHaveBeenCalledWith({
        passageId: 1,
        startedAt: FIXED_NOW,
        timeLimitSeconds: 240,
        userId: 7,
      })
    })

    it("本文をセグメントに分け、語義設問の対象語句（escape hatch）は用語集にもセグメントの glossaryEntryId にも無い。設問に正解・解説・根拠が無い", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent())
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(buildAttempt())

      const view = extractView(await startAttempt(INPUT, repo))

      expect(view.blocks.map((block) => block.segments.flatMap((segment) => segment.glossaryEntryId ?? []))).toEqual([
        [],
        [101],
        [],
        [],
        [103],
      ])
      expect(view.blocks[3]?.segments).toEqual([])
      expect(view.blocks[4]?.segments).toEqual([
        { canLookUp: false, kind: "word", text: "You" },
        { kind: "space", text: " " },
        { canLookUp: false, kind: "word", text: "can" },
        { kind: "space", text: " " },
        { canLookUp: true, glossaryEntryId: 103, kind: "word", text: "opt out of" },
        { kind: "space", text: " " },
        { canLookUp: true, kind: "word", text: "re-running" },
        { kind: "space", text: " " },
        { canLookUp: false, kind: "word", text: "an" },
        { kind: "space", text: " " },
        { canLookUp: true, kind: "word", text: "Effect" },
        { kind: "space", text: " " },
        { canLookUp: false, kind: "word", text: "by" },
        { kind: "space", text: " " },
        { canLookUp: true, kind: "word", text: "specifying" },
        { kind: "space", text: " " },
        { canLookUp: false, kind: "word", text: "a" },
        { kind: "space", text: " " },
        { canLookUp: true, kind: "word", text: "dependency" },
        { kind: "space", text: " " },
        { canLookUp: true, kind: "word", text: "array" },
        { kind: "punct", text: "." },
      ])
      expect(view.blocks[1]?.segments).toEqual(
        expect.arrayContaining([{ canLookUp: true, kind: "word", text: "escape" }, { canLookUp: true, kind: "word", text: "hatch" }]),
      )
      expect(view.glossary.map((entry) => entry.id)).toEqual([101, 103])
      expect(view.questions).toEqual(EXPECTED_QUESTIONS)
      const serialized = JSON.stringify(view)
      expect(serialized).not.toContain("correctChoiceIndex")
      expect(serialized).not.toContain("explanationJa")
      expect(serialized).not.toContain("evidence")
    })

    it("用語集の語句はほかの段落の同じ表記も glossaryEntryId を持ち、語義設問の対象語句（escape hatch）はほかの段落でも普通の単語になる", async () => {
      const blocks = buildAttemptContent().passage.blocks.map((block, index) =>
        index === 2 ? { ...block, text: "Use an escape hatch only when you need to stay in sync with a server." } : block,
      )
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent({ blocks }))
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(buildAttempt())

      const view = extractView(await startAttempt(INPUT, repo))

      expect(view.blocks.map((block) => block.segments.flatMap((segment) => segment.glossaryEntryId ?? []))).toEqual([
        [],
        [101],
        [101],
        [],
        [103],
      ])
      expect(view.blocks[2]?.segments).toEqual(
        expect.arrayContaining([{ canLookUp: true, kind: "word", text: "escape" }, { canLookUp: true, kind: "word", text: "hatch" }]),
      )
    })

    it("語義設問の対象語句と表記が同じ別の項目も用語集から外し、対象語句の位置に意味が出ない", async () => {
      const content = buildAttemptContent()
      const blocks = content.passage.blocks.map((block, index) =>
        index === 2 ? { ...block, text: "Use an escape hatch only when you need it." } : block,
      )
      const target = content.glossary.find((entry) => entry.id === 102)
      if (!target) throw new Error("Expected glossary entry 102")
      const sameSurfaceEntry = { ...target, id: 104, blockIndex: 2, endOffset: 19, startOffset: 7 }
      passageRepository.findAttemptContentById.mockResolvedValue({
        ...content,
        glossary: [...content.glossary, sameSurfaceEntry],
        passage: { ...content.passage, blocks },
      })
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(buildAttempt())

      const view = extractView(await startAttempt(INPUT, repo))

      expect(view.blocks.map((block) => block.segments.flatMap((segment) => segment.glossaryEntryId ?? []))).toEqual([
        [],
        [101],
        [],
        [],
        [103],
      ])
      expect(view.glossary.map((entry) => entry.id)).toEqual([101, 103])
    })

    it("期限内の挑戦中があれば isCreated: false でそれを返し（制限時間は開始時点の値）、挑戦中を作らない", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent({ timeLimitSeconds: 240 }))
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(buildAttempt({ id: 301, timeLimitSeconds: 180 }))

      const result = await startAttempt(INPUT, repo)

      expect(result.ok && result.value.isCreated).toBe(false)
      expect(result.ok && result.value.view).toMatchObject({
        id: 301,
        expiresAt: new Date("2026-10-13T10:00:00.000Z"),
        startedAt: new Date("2026-10-12T10:00:00.000Z"),
        timeLimitSeconds: 180,
      })
      expect(readingAttemptRepository.createInProgress).not.toHaveBeenCalled()
    })

    it("期限切れの更新（expireStale）を、挑戦中を探すより先に、そのユーザーと 24 時間前の境目で呼ぶ。挑戦中は primary から探す", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent())
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(buildAttempt())

      await startAttempt(INPUT, repo)

      expect(readingAttemptRepository.expireStale).toHaveBeenCalledWith(7, ALIVE_SINCE)
      expect(readingAttemptRepository.findAliveInProgress).toHaveBeenCalledWith(7, 1, ALIVE_SINCE, PRIMARY)
      const [expireOrder] = readingAttemptRepository.expireStale.mock.invocationCallOrder
      const [findOrder] = readingAttemptRepository.findAliveInProgress.mock.invocationCallOrder
      expect(expireOrder).toBeLessThan(findOrder ?? 0)
    })

    it("非公開に戻された問題でも、期限内の挑戦中があれば再開できる", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent({ status: "draft" }))
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(buildAttempt())

      const result = await startAttempt(INPUT, repo)

      expect(result.ok && result.value.isCreated).toBe(false)
      expect(readingAttemptRepository.createInProgress).not.toHaveBeenCalled()
    })

    it("同時に開始されて createInProgress が null なら、先に作られた挑戦中を isCreated: false で返す", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent())
      readingAttemptRepository.findAliveInProgress
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildAttempt({ id: 305, startedAt: new Date("2026-10-12T23:59:59.000Z") }))
      readingAttemptRepository.createInProgress.mockResolvedValue(null)

      const result = await startAttempt(INPUT, repo)

      expect(result.ok && result.value.isCreated).toBe(false)
      expect(result.ok && result.value.view.id).toBe(305)
      expect(readingAttemptRepository.findAliveInProgress).toHaveBeenCalledTimes(2)
    })

    it("最初の確認も、同時に開始されたときの読み直しも、read replica の遅れで見失わないよう primary から読む", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent())
      readingAttemptRepository.findAliveInProgress
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildAttempt({ id: 305 }))
      readingAttemptRepository.createInProgress.mockResolvedValue(null)

      await startAttempt(INPUT, repo)

      expect(readingAttemptRepository.findAliveInProgress.mock.calls).toEqual([
        [7, 1, ALIVE_SINCE, PRIMARY],
        [7, 1, ALIVE_SINCE, PRIMARY],
      ])
    })

    it("新しく作れたときは読み直さない", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent())
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(null)
      readingAttemptRepository.createInProgress.mockResolvedValue(buildAttempt({ id: 302, startedAt: FIXED_NOW }))

      await startAttempt(INPUT, repo)

      expect(readingAttemptRepository.findAliveInProgress.mock.calls).toEqual([[7, 1, ALIVE_SINCE, PRIMARY]])
    })
  })

  describe("異常系", () => {
    it("ユーザーが居なければ 401 を返し、期限切れの更新も挑戦中の作成もしない", async () => {
      userRepository.findById.mockResolvedValue(null)

      const result = await startAttempt(INPUT, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 401, type: "UNAUTHORIZED" }), ok: false })
      expect(readingAttemptRepository.expireStale).not.toHaveBeenCalled()
      expect(readingAttemptRepository.createInProgress).not.toHaveBeenCalled()
    })

    it("問題が無ければ 404 を返し、挑戦中を作らない", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(null)

      const result = await startAttempt(INPUT, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
      expect(readingAttemptRepository.createInProgress).not.toHaveBeenCalled()
    })

    it.each([
      ["draft"],
      ["rejected"],
    ] as const)("%s の問題で挑戦中が無ければ 404 を返し、挑戦中を作らない", async (status) => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent({ status }))
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(null)

      const result = await startAttempt(INPUT, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
      expect(readingAttemptRepository.createInProgress).not.toHaveBeenCalled()
    })

    it("createInProgress が null なのに挑戦中も見つからなければ throw する", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent())
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(null)
      readingAttemptRepository.createInProgress.mockResolvedValue(null)

      await expect(startAttempt(INPUT, repo)).rejects.toThrow()
    })
  })
})
