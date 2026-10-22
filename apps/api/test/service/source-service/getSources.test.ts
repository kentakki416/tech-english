import { getSources } from "../../../src/service/source-service"

import { buildGitHubSource, buildWebsiteSource, createMockSourceRepository } from "./fixtures"

const sourceRepository = createMockSourceRepository()

const ZERO_COUNTS = { collected: 0, draft: 0, failed: 0, generating: 0, published: 0, rejected: 0 }

describe("getSources", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("ソースごとに状態別の件数を集計し、行の無い状態は 0、取得失敗の件数を付ける", async () => {
      const github = buildGitHubSource({ id: 1 })
      const website = buildWebsiteSource({ id: 2 })
      sourceRepository.findAll.mockResolvedValue([github, website])
      sourceRepository.countPassagesBySource.mockResolvedValue([
        { count: 5, sourceId: 1, status: "collected" },
        { count: 2, sourceId: 1, status: "published" },
        { count: 3, sourceId: 2, status: "draft" },
      ])
      sourceRepository.countFailedPagesBySource.mockResolvedValue([{ count: 4, sourceId: 2 }])

      const result = await getSources({ sourceRepository })

      expect(result).toEqual({
        ok: true,
        value: [
          { failedPageCount: 0, passageCounts: { ...ZERO_COUNTS, collected: 5, published: 2 }, source: github },
          { failedPageCount: 4, passageCounts: { ...ZERO_COUNTS, draft: 3 }, source: website },
        ],
      })
      expect(sourceRepository.countPassagesBySource).toHaveBeenCalledWith()
    })

    it("本文候補も取得失敗も無いソースはすべて 0 になる", async () => {
      const github = buildGitHubSource()
      sourceRepository.findAll.mockResolvedValue([github])
      sourceRepository.countPassagesBySource.mockResolvedValue([])
      sourceRepository.countFailedPagesBySource.mockResolvedValue([])

      const result = await getSources({ sourceRepository })

      expect(result).toEqual({
        ok: true,
        value: [{ failedPageCount: 0, passageCounts: ZERO_COUNTS, source: github }],
      })
    })

    it("ソースが 0 件なら空配列を返す", async () => {
      sourceRepository.findAll.mockResolvedValue([])
      sourceRepository.countPassagesBySource.mockResolvedValue([])
      sourceRepository.countFailedPagesBySource.mockResolvedValue([])

      const result = await getSources({ sourceRepository })

      expect(result).toEqual({ ok: true, value: [] })
    })
  })

  describe("異常系", () => {
    it("データベースエラー時に例外が伝播する", async () => {
      sourceRepository.findAll.mockRejectedValue(new Error("Database connection failed"))
      sourceRepository.countPassagesBySource.mockResolvedValue([])
      sourceRepository.countFailedPagesBySource.mockResolvedValue([])

      await expect(getSources({ sourceRepository })).rejects.toThrow()
    })
  })
})
