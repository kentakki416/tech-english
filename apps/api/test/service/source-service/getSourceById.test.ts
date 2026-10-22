import { getSourceById } from "../../../src/service/source-service"

import { buildWebsiteSource, createMockSourceRepository } from "./fixtures"

const sourceRepository = createMockSourceRepository()

describe("getSourceById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("ソースと 1 ソース分の状態別の件数（行の無い状態は 0）を返す", async () => {
      const website = buildWebsiteSource({ id: 2 })
      sourceRepository.findById.mockResolvedValue(website)
      sourceRepository.countPassagesBySource.mockResolvedValue([
        { count: 7, sourceId: 2, status: "collected" },
        { count: 1, sourceId: 2, status: "failed" },
      ])

      const result = await getSourceById(2, { sourceRepository })

      expect(result).toEqual({
        ok: true,
        value: {
          passageCounts: { collected: 7, draft: 0, failed: 1, generating: 0, published: 0, rejected: 0 },
          source: website,
        },
      })
      expect(sourceRepository.countPassagesBySource).toHaveBeenCalledWith(2)
    })
  })

  describe("異常系", () => {
    it("存在しない id なら 404 NOT_FOUND を返し、件数を数えない", async () => {
      sourceRepository.findById.mockResolvedValue(null)

      const result = await getSourceById(999, { sourceRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(sourceRepository.countPassagesBySource).not.toHaveBeenCalled()
    })
  })
})
