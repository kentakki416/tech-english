import { getSources } from "../../../src/service/source-service"

import { buildGitHubSource, buildSourceCollectionRun, buildWebsiteSource, createMockSourceCollectionRunRepository, createMockSourceRepository } from "./fixtures"

const sourceRepository = createMockSourceRepository()
const sourceCollectionRunRepository = createMockSourceCollectionRunRepository()
const repo = { sourceCollectionRunRepository, sourceRepository }

const NOW = new Date("2026-10-22T04:00:00.000Z")
const deps = { now: NOW }

const ZERO_COUNTS = { collected: 0, draft: 0, failed: 0, generating: 0, published: 0, rejected: 0 }

describe("getSources", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sourceCollectionRunRepository.failTimedOut.mockResolvedValue(0)
    sourceCollectionRunRepository.findLatestPerSource.mockResolvedValue([])
  })

  describe("正常系", () => {
    it("ソースごとに状態別の件数を集計し、行の無い状態は 0 にする", async () => {
      const github = buildGitHubSource({ id: 1 })
      const website = buildWebsiteSource({ id: 2 })
      sourceRepository.findAll.mockResolvedValue([github, website])
      sourceRepository.countPassagesBySource.mockResolvedValue([
        { count: 5, sourceId: 1, status: "collected" },
        { count: 2, sourceId: 1, status: "published" },
        { count: 3, sourceId: 2, status: "draft" },
      ])

      const result = await getSources(repo, deps)

      expect(result).toEqual({
        ok: true,
        value: [
          { latestCollectionRun: null, passageCounts: { ...ZERO_COUNTS, collected: 5, published: 2 }, source: github },
          { latestCollectionRun: null, passageCounts: { ...ZERO_COUNTS, draft: 3 }, source: website },
        ],
      })
      expect(sourceRepository.countPassagesBySource).toHaveBeenCalledWith(undefined, { fromPrimary: true })
    })

    it("本文候補が無いソースはすべて 0 になる", async () => {
      const github = buildGitHubSource()
      sourceRepository.findAll.mockResolvedValue([github])
      sourceRepository.countPassagesBySource.mockResolvedValue([])

      const result = await getSources(repo, deps)

      expect(result).toEqual({
        ok: true,
        value: [{ latestCollectionRun: null, passageCounts: ZERO_COUNTS, source: github }],
      })
    })

    it("ソースが 0 件なら空配列を返す", async () => {
      sourceRepository.findAll.mockResolvedValue([])
      sourceRepository.countPassagesBySource.mockResolvedValue([])

      const result = await getSources(repo, deps)

      expect(result).toEqual({ ok: true, value: [] })
    })

    it("最後の収集の記録を、そのソースの行に付ける", async () => {
      const github = buildGitHubSource({ id: 1 })
      const otherGithub = buildGitHubSource({ id: 2 })
      const run = buildSourceCollectionRun({ sourceId: 2, status: "limit_reached" })
      sourceRepository.findAll.mockResolvedValue([github, otherGithub])
      sourceRepository.countPassagesBySource.mockResolvedValue([])
      sourceCollectionRunRepository.findLatestPerSource.mockResolvedValue([run])

      const result = await getSources(repo, deps)

      expect(result).toEqual({
        ok: true,
        value: [
          { latestCollectionRun: null, passageCounts: ZERO_COUNTS, source: github },
          { latestCollectionRun: run, passageCounts: ZERO_COUNTS, source: otherGithub },
        ],
      })
    })

    it("時間切れの収集をすべてのソースについて片付けてから、primary から読む", async () => {
      sourceRepository.findAll.mockResolvedValue([])
      sourceRepository.countPassagesBySource.mockResolvedValue([])

      await getSources(repo, deps)

      expect(sourceCollectionRunRepository.failTimedOut).toHaveBeenCalledWith({
        error: expect.any(String),
        now: NOW,
        sourceId: undefined,
        staleBefore: new Date("2026-10-22T03:30:00.000Z"),
      })
      expect(sourceCollectionRunRepository.failTimedOut.mock.invocationCallOrder[0])
        .toBeLessThan(sourceCollectionRunRepository.findLatestPerSource.mock.invocationCallOrder[0])
      expect(sourceRepository.findAll).toHaveBeenCalledWith({ fromPrimary: true })
      expect(sourceCollectionRunRepository.findLatestPerSource).toHaveBeenCalledWith({ fromPrimary: true })
    })
  })

  describe("異常系", () => {
    it("データベースエラー時に例外が伝播する", async () => {
      sourceRepository.findAll.mockRejectedValue(new Error("Database connection failed"))
      sourceRepository.countPassagesBySource.mockResolvedValue([])

      await expect(getSources(repo, deps)).rejects.toThrow()
    })
  })
})
