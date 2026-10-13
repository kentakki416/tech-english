import { getRandomPassageId } from "../../../src/service/passage-service"
import { createMockPassageRepository, createMockReadingAttemptRepository } from "../../fixture/passage-repository-mock"

const passageRepository = createMockPassageRepository()
const readingAttemptRepository = createMockReadingAttemptRepository()
const repo = { passageRepository, readingAttemptRepository }

const FILTER = { difficulties: [2] as 2[], kind: "docs" as const, tags: ["react"] }

describe("getRandomPassageId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("未挑戦の問題があればそれを返し、全体からは選ばない", async () => {
      passageRepository.findRandomPublishedId.mockResolvedValueOnce(12)

      const result = await getRandomPassageId({ filter: FILTER, userId: 7 }, repo)

      expect(result).toEqual({ ok: true, value: { id: 12 } })
      expect(passageRepository.findRandomPublishedId).toHaveBeenCalledTimes(1)
      expect(passageRepository.findRandomPublishedId).toHaveBeenCalledWith({ ...FILTER, unattemptedByUserId: 7 })
    })

    it("未挑戦の問題が無ければ、同じ絞り込みで全体から選ぶ", async () => {
      passageRepository.findRandomPublishedId.mockResolvedValueOnce(null).mockResolvedValueOnce(5)

      const result = await getRandomPassageId({ filter: FILTER, userId: 7 }, repo)

      expect(result).toEqual({ ok: true, value: { id: 5 } })
      expect(passageRepository.findRandomPublishedId).toHaveBeenNthCalledWith(1, { ...FILTER, unattemptedByUserId: 7 })
      expect(passageRepository.findRandomPublishedId).toHaveBeenNthCalledWith(2, { ...FILTER, unattemptedByUserId: null })
    })
  })

  describe("異常系", () => {
    it("未挑戦にも全体にも無ければ 404 を返す", async () => {
      passageRepository.findRandomPublishedId.mockResolvedValue(null)

      const result = await getRandomPassageId({ filter: FILTER, userId: 7 }, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })
  })
})
