import { getSourceById } from "../../../src/service/source-service"

import {
  buildSourceCollectionRun,
  buildWebsiteSource,
  createMockSourceCollectionRunRepository,
  createMockSourceRepository,
} from "./fixtures"

const sourceRepository = createMockSourceRepository()
const sourceCollectionRunRepository = createMockSourceCollectionRunRepository()

const NOW = new Date("2026-10-22T04:00:00.000Z")

describe("getSourceById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sourceCollectionRunRepository.failTimedOut.mockResolvedValue(0)
    sourceCollectionRunRepository.findLatestBySourceId.mockResolvedValue(null)
  })

  describe("正常系", () => {
    it("ソースと 1 ソース分の状態別の件数（行の無い状態は 0）と、最後の収集の記録を返す", async () => {
      const website = buildWebsiteSource({ id: 2 })
      const run = buildSourceCollectionRun({ sourceId: 2, status: "completed" })
      sourceRepository.findById.mockResolvedValue(website)
      sourceRepository.countPassagesBySource.mockResolvedValue([
        { count: 7, sourceId: 2, status: "collected" },
        { count: 1, sourceId: 2, status: "failed" },
      ])
      sourceCollectionRunRepository.findLatestBySourceId.mockResolvedValue(run)

      const result = await getSourceById(2, { sourceCollectionRunRepository, sourceRepository }, { now: NOW })

      expect(result).toEqual({
        ok: true,
        value: {
          latestCollectionRun: run,
          passageCounts: { collected: 7, draft: 0, failed: 1, generating: 0, published: 0, rejected: 0 },
          source: website,
        },
      })
      expect(sourceRepository.countPassagesBySource).toHaveBeenCalledWith(2)
      expect(sourceCollectionRunRepository.findLatestBySourceId).toHaveBeenCalledWith(2)
    })

    it("記録を読む前に、30 分より前から収集中の記録を failed にする", async () => {
      sourceRepository.findById.mockResolvedValue(buildWebsiteSource({ id: 2 }))
      sourceRepository.countPassagesBySource.mockResolvedValue([])

      await getSourceById(2, { sourceCollectionRunRepository, sourceRepository }, { now: NOW })

      expect(sourceCollectionRunRepository.failTimedOut).toHaveBeenCalledWith({
        error: expect.any(String),
        now: NOW,
        sourceId: 2,
        startedBefore: new Date("2026-10-22T03:30:00.000Z"),
      })
      expect(sourceCollectionRunRepository.failTimedOut.mock.invocationCallOrder[0])
        .toBeLessThan(sourceCollectionRunRepository.findLatestBySourceId.mock.invocationCallOrder[0])
    })
  })

  describe("異常系", () => {
    it("存在しない id なら 404 NOT_FOUND を返し、件数も記録も読まない", async () => {
      sourceRepository.findById.mockResolvedValue(null)

      const result = await getSourceById(999, { sourceCollectionRunRepository, sourceRepository }, { now: NOW })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(sourceRepository.countPassagesBySource).not.toHaveBeenCalled()
      expect(sourceCollectionRunRepository.failTimedOut).not.toHaveBeenCalled()
      expect(sourceCollectionRunRepository.findLatestBySourceId).not.toHaveBeenCalled()
    })
  })
})
