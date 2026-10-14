import { getContentSourceById } from "../../../src/service/content-source-service"

import { buildWebsiteSource, createMockContentSourceRepository } from "./fixtures"

const contentSourceRepository = createMockContentSourceRepository()

describe("getContentSourceById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("ソースと 1 ソース分の状態別の件数（行の無い状態は 0）と取得失敗のページを返す", async () => {
      const website = buildWebsiteSource({ id: 2 })
      const failedPages = [
        { httpStatus: 404, path: "/doc/a" },
        { httpStatus: 500, path: "/doc/b" },
      ]
      contentSourceRepository.findById.mockResolvedValue(website)
      contentSourceRepository.countPassagesBySource.mockResolvedValue([
        { count: 7, sourceId: 2, status: "collected" },
        { count: 1, sourceId: 2, status: "failed" },
      ])
      contentSourceRepository.findFailedPages.mockResolvedValue(failedPages)

      const result = await getContentSourceById(2, { contentSourceRepository })

      expect(result).toEqual({
        ok: true,
        value: {
          failedPages,
          passageCounts: { collected: 7, draft: 0, failed: 1, generating: 0, published: 0, rejected: 0 },
          source: website,
        },
      })
      expect(contentSourceRepository.countPassagesBySource).toHaveBeenCalledWith(2)
      expect(contentSourceRepository.findFailedPages).toHaveBeenCalledWith(2)
    })
  })

  describe("異常系", () => {
    it("存在しない id なら 404 NOT_FOUND を返し、件数を数えない", async () => {
      contentSourceRepository.findById.mockResolvedValue(null)

      const result = await getContentSourceById(999, { contentSourceRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(404)
        expect(result.error.type).toBe("NOT_FOUND")
      }
      expect(contentSourceRepository.countPassagesBySource).not.toHaveBeenCalled()
      expect(contentSourceRepository.findFailedPages).not.toHaveBeenCalled()
    })
  })
})
