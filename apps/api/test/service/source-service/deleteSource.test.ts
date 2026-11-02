import { deleteSource } from "../../../src/service/source-service"

import { createMockSourceCollectionRunRepository, createMockSourceRepository } from "./fixtures"

const sourceRepository = createMockSourceRepository()
const sourceCollectionRunRepository = createMockSourceCollectionRunRepository()

const NOW = new Date("2026-10-22T04:00:00.000Z")

const callDeleteSource = async (id: number) =>
  deleteSource(id, { sourceCollectionRunRepository, sourceRepository }, { now: NOW })

describe("deleteSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sourceCollectionRunRepository.failTimedOut.mockResolvedValue(0)
  })

  describe("正常系", () => {
    it("時間切れの収集の記録を片付けてから削除する", async () => {
      sourceRepository.deleteWithContent.mockResolvedValue({ deletedAttemptCount: 2, deletedPassageCount: 3, kind: "deleted" })

      const result = await callDeleteSource(1)

      expect(result).toEqual({ ok: true, value: { deleted: true } })
      expect(sourceCollectionRunRepository.failTimedOut).toHaveBeenCalledWith(expect.objectContaining({ now: NOW, sourceId: 1 }))
      expect(sourceRepository.deleteWithContent).toHaveBeenCalledWith(1)
      expect(sourceCollectionRunRepository.failTimedOut.mock.invocationCallOrder[0])
        .toBeLessThan(sourceRepository.deleteWithContent.mock.invocationCallOrder[0])
    })
  })

  describe("異常系", () => {
    it("ソースが無ければ 404 を返す", async () => {
      sourceRepository.deleteWithContent.mockResolvedValue({ kind: "not_found" })

      const result = await callDeleteSource(1)

      expect(result).toMatchObject({ error: { statusCode: 404, type: "NOT_FOUND" }, ok: false })
    })

    it("収集中で止まったら 409 を返す", async () => {
      sourceRepository.deleteWithContent.mockResolvedValue({ kind: "collecting" })

      const result = await callDeleteSource(1)

      expect(result).toMatchObject({ error: { statusCode: 409, type: "CONFLICT" }, ok: false })
    })
  })
})
