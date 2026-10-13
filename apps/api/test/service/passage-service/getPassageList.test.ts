import { decodePassageCursor, encodePassageCursor } from "../../../src/lib/passage-cursor"
import { getPassageList } from "../../../src/service/passage-service"
import { createMockPassageRepository, createMockReadingAttemptRepository } from "../../fixture/passage-repository-mock"

import { buildPublishedSummary, FIXED_NOW } from "./fixtures"

const passageRepository = createMockPassageRepository()
const readingAttemptRepository = createMockReadingAttemptRepository()
const repo = { passageRepository, readingAttemptRepository }

const NO_FILTER = { difficulties: [], kind: null, tags: [] }

const UNATTEMPTED = { attemptCount: 0, bestCorrectCount: null, inProgressAttemptId: null }

describe("getPassageList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passageRepository.findPublishedPage.mockResolvedValue([])
    passageRepository.countPublished.mockResolvedValue(0)
    passageRepository.findPublishedTags.mockResolvedValue(["go", "react"])
    readingAttemptRepository.summarizeByPassageIds.mockResolvedValue([])
  })

  describe("正常系", () => {
    it("limit + 1 件返ると、limit 件目から次の cursor を作り、余った 1 件は返さない（境界値）", async () => {
      const last = buildPublishedSummary(2, { publishedAt: new Date("2026-10-11T05:00:00.123Z") })
      passageRepository.findPublishedPage.mockResolvedValue([buildPublishedSummary(3), last, buildPublishedSummary(1)])
      passageRepository.countPublished.mockResolvedValue(3)

      const result = await getPassageList(
        { cursor: undefined, filter: NO_FILTER, limit: 2, now: FIXED_NOW, unattemptedOnly: false, userId: 7 },
        repo,
      )

      expect(result).toEqual({
        ok: true,
        value: {
          items: [
            { ...buildPublishedSummary(3), myStatus: UNATTEMPTED },
            { ...last, myStatus: UNATTEMPTED },
          ],
          nextCursor: expect.any(String),
          tags: ["go", "react"],
          totalCount: 3,
        },
      })
      expect(passageRepository.findPublishedPage).toHaveBeenCalledWith(
        { ...NO_FILTER, unattemptedByUserId: null },
        { cursor: null, limit: 3 },
      )
      if (!result.ok || !result.value.nextCursor) return
      expect(decodePassageCursor(result.value.nextCursor)).toEqual({ id: 2, publishedAt: new Date("2026-10-11T05:00:00.123Z") })
    })

    it("limit 件ちょうどなら nextCursor は null（境界値）", async () => {
      passageRepository.findPublishedPage.mockResolvedValue([buildPublishedSummary(2), buildPublishedSummary(1)])

      const result = await getPassageList(
        { cursor: undefined, filter: NO_FILTER, limit: 2, now: FIXED_NOW, unattemptedOnly: false, userId: 7 },
        repo,
      )

      expect(result.ok && result.value.nextCursor).toBeNull()
      expect(result.ok && result.value.items.map((item) => item.passage.id)).toEqual([2, 1])
    })

    it("cursor を decode して findPublishedPage に渡し、同じ絞り込みで件数を数える", async () => {
      const cursor = { id: 9, publishedAt: new Date("2026-10-11T00:00:00.000Z") }
      const filter = { difficulties: [1, 3] as (1 | 3)[], kind: "docs" as const, tags: ["react", "rust"] }

      await getPassageList(
        { cursor: encodePassageCursor(cursor), filter, limit: 20, now: FIXED_NOW, unattemptedOnly: false, userId: 7 },
        repo,
      )

      expect(passageRepository.findPublishedPage).toHaveBeenCalledWith({ ...filter, unattemptedByUserId: null }, { cursor, limit: 21 })
      expect(passageRepository.countPublished).toHaveBeenCalledWith({ ...filter, unattemptedByUserId: null })
      expect(passageRepository.findPublishedTags).toHaveBeenCalledTimes(1)
    })

    it.each([
      [true, 7],
      [false, null],
    ])("unattemptedOnly=%s なら unattemptedByUserId: %s を渡す", async (unattemptedOnly, expected) => {
      await getPassageList(
        { cursor: undefined, filter: NO_FILTER, limit: 20, now: FIXED_NOW, unattemptedOnly, userId: 7 },
        repo,
      )

      expect(passageRepository.findPublishedPage).toHaveBeenCalledWith(
        { ...NO_FILTER, unattemptedByUserId: expected },
        expect.any(Object),
      )
      expect(passageRepository.countPublished).toHaveBeenCalledWith({ ...NO_FILTER, unattemptedByUserId: expected })
    })

    it("取得した問題の ID と 24 時間前の時刻で挑戦を集計し、集計が無い問題は未挑戦の形にする", async () => {
      passageRepository.findPublishedPage.mockResolvedValue([buildPublishedSummary(2), buildPublishedSummary(1)])
      readingAttemptRepository.summarizeByPassageIds.mockResolvedValue([
        { attemptCount: 2, bestCorrectCount: 3, inProgressAttemptId: 55, passageId: 2 },
      ])

      const result = await getPassageList(
        { cursor: undefined, filter: NO_FILTER, limit: 20, now: FIXED_NOW, unattemptedOnly: false, userId: 7 },
        repo,
      )

      expect(readingAttemptRepository.summarizeByPassageIds).toHaveBeenCalledWith(7, [2, 1], new Date("2026-10-12T00:00:00.000Z"))
      expect(result.ok && result.value.items.map((item) => item.myStatus)).toEqual([
        { attemptCount: 2, bestCorrectCount: 3, inProgressAttemptId: 55 },
        UNATTEMPTED,
      ])
    })
  })

  describe("異常系", () => {
    it("壊れた cursor なら 400 を返し、Repository を呼ばない", async () => {
      const result = await getPassageList(
        { cursor: "broken", filter: NO_FILTER, limit: 20, now: FIXED_NOW, unattemptedOnly: false, userId: 7 },
        repo,
      )

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 400, type: "BAD_REQUEST" }), ok: false })
      expect(passageRepository.findPublishedPage).not.toHaveBeenCalled()
      expect(passageRepository.countPublished).not.toHaveBeenCalled()
    })
  })
})
