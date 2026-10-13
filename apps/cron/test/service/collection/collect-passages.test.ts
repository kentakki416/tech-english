import { GitHubRateLimitError } from "../../../src/client/github"
import {
  collectGitHubSource,
  collectPassages,
  type CollectPassagesInput,
  collectWebsiteSource,
} from "../../../src/service/collection"

import { buildGitHubSource, buildWebsiteSource, createDeps, createFakeGitHubClient, createFakeRepo, NOW } from "./helpers"

/**
 * 1 ソース分の収集は collect-github-source.test.ts / collect-website-source.test.ts で確かめるので、ここでは差し替えて結果だけを返す
 */
vi.mock("../../../src/service/collection/collect-github-source", () => ({ collectGitHubSource: vi.fn() }))
vi.mock("../../../src/service/collection/collect-website-source", () => ({ collectWebsiteSource: vi.fn() }))

const collectGitHubSourceMock = vi.mocked(collectGitHubSource)

const collectWebsiteSourceMock = vi.mocked(collectWebsiteSource)

const buildInput = (overrides: Partial<CollectPassagesInput> = {}): CollectPassagesInput => ({
  githubMinRateLimitRemaining: 100,
  maxDocumentsPerSource: 100,
  maxPassagesPerRun: 200,
  now: NOW,
  refetchDays: 7,
  sourceId: null,
  ...overrides,
})

const buildCompletedResult = (createdPassageCount: number) => ({
  createdPassageCount,
  fetchedDocumentCount: 1,
  status: "completed" as const,
})

describe("collectPassages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("有効なソースを順に処理し、残りの本文候補数を maxPassages として渡す", async () => {
      const sources = [buildGitHubSource({ id: 1 }), buildGitHubSource({ id: 3, repository: "owner/other" })]
      const repo = createFakeRepo({ enabledSources: sources })
      collectGitHubSourceMock.mockResolvedValueOnce(buildCompletedResult(30)).mockResolvedValueOnce(buildCompletedResult(5))

      const result = await collectPassages(buildInput(), repo, createDeps(createFakeGitHubClient()))

      expect(result).toEqual({
        createdPassageCount: 35,
        failedSourceIds: [],
        results: [{ ...buildCompletedResult(30), sourceId: 1 }, { ...buildCompletedResult(5), sourceId: 3 }],
      })
      expect(collectGitHubSourceMock.mock.calls.map(([input]) => input)).toEqual([
        { maxDocuments: 100, maxPassages: 200, minRateLimitRemaining: 100, now: NOW, source: sources[0] },
        { maxDocuments: 100, maxPassages: 170, minRateLimitRemaining: 100, now: NOW, source: sources[1] },
      ])
    })

    it("1 ソースが throw しても次のソースを処理し、failedSourceIds に入る", async () => {
      const repo = createFakeRepo({ enabledSources: [buildGitHubSource({ id: 1 }), buildGitHubSource({ id: 2 })] })
      collectGitHubSourceMock.mockRejectedValueOnce(new Error("Not Found")).mockResolvedValueOnce(buildCompletedResult(3))

      const result = await collectPassages(buildInput(), repo, createDeps(createFakeGitHubClient()))

      expect(result).toEqual({ createdPassageCount: 3, failedSourceIds: [1], results: [{ ...buildCompletedResult(3), sourceId: 2 }] })
    })

    it("GitHubRateLimitError は失敗にならず、以降の GitHub のソースが飛ばされる", async () => {
      const repo = createFakeRepo({
        enabledSources: [buildGitHubSource({ id: 1 }), buildGitHubSource({ id: 2 }), buildGitHubSource({ id: 3 })],
      })
      collectGitHubSourceMock.mockResolvedValueOnce(buildCompletedResult(2)).mockRejectedValueOnce(new GitHubRateLimitError("/x"))

      const result = await collectPassages(buildInput(), repo, createDeps(createFakeGitHubClient()))

      expect(result).toEqual({ createdPassageCount: 2, failedSourceIds: [], results: [{ ...buildCompletedResult(2), sourceId: 1 }] })
      expect(collectGitHubSourceMock).toHaveBeenCalledTimes(2)
    })

    it("rate_limited で終えたソースの後も、以降の GitHub のソースが飛ばされる", async () => {
      const repo = createFakeRepo({ enabledSources: [buildGitHubSource({ id: 1 }), buildGitHubSource({ id: 2 })] })
      collectGitHubSourceMock.mockResolvedValueOnce({ createdPassageCount: 4, fetchedDocumentCount: 2, status: "rate_limited" })

      const result = await collectPassages(buildInput(), repo, createDeps(createFakeGitHubClient()))

      expect(result.failedSourceIds).toEqual([])
      expect(collectGitHubSourceMock).toHaveBeenCalledTimes(1)
    })

    it("本文候補の上限に達したら残りのソースを処理しない", async () => {
      const repo = createFakeRepo({ enabledSources: [buildGitHubSource({ id: 1 }), buildGitHubSource({ id: 2 })] })
      collectGitHubSourceMock.mockResolvedValueOnce(buildCompletedResult(10))

      const result = await collectPassages(buildInput({ maxPassagesPerRun: 10 }), repo, createDeps(createFakeGitHubClient()))

      expect(result).toEqual({ createdPassageCount: 10, failedSourceIds: [], results: [{ ...buildCompletedResult(10), sourceId: 1 }] })
      expect(collectGitHubSourceMock).toHaveBeenCalledTimes(1)
    })

    it("website のソースは collectWebsiteSource で処理し、残りの本文候補数と refetchDays を渡す", async () => {
      const website = buildWebsiteSource({ id: 2 })
      const repo = createFakeRepo({ enabledSources: [buildGitHubSource({ id: 1 }), website] })
      collectGitHubSourceMock.mockResolvedValueOnce(buildCompletedResult(15))
      collectWebsiteSourceMock.mockResolvedValueOnce(buildCompletedResult(4))

      const result = await collectPassages(buildInput({ refetchDays: 3 }), repo, createDeps(createFakeGitHubClient()))

      expect(result).toEqual({
        createdPassageCount: 19,
        failedSourceIds: [],
        results: [{ ...buildCompletedResult(15), sourceId: 1 }, { ...buildCompletedResult(4), sourceId: 2 }],
      })
      expect(collectWebsiteSourceMock).toHaveBeenCalledWith(
        { maxDocuments: 100, maxPassages: 185, now: NOW, refetchDays: 3, source: website },
        repo,
        expect.objectContaining({ createWebPageClient: expect.any(Function) }),
      )
    })

    it("website の throttled は失敗に数えず、次のソースへ進む", async () => {
      const repo = createFakeRepo({ enabledSources: [buildWebsiteSource({ id: 2 }), buildGitHubSource({ id: 1 })] })
      collectWebsiteSourceMock.mockResolvedValueOnce({ createdPassageCount: 1, fetchedDocumentCount: 3, status: "throttled" })
      collectGitHubSourceMock.mockResolvedValueOnce(buildCompletedResult(2))

      const result = await collectPassages(buildInput(), repo, createDeps(createFakeGitHubClient()))

      expect(result.failedSourceIds).toEqual([])
      expect(result.results.map(({ sourceId, status }) => ({ sourceId, status }))).toEqual([
        { sourceId: 2, status: "throttled" },
        { sourceId: 1, status: "completed" },
      ])
    })

    it("GitHub の rate limit で GitHub のソースを飛ばしても、website のソースは処理する", async () => {
      const repo = createFakeRepo({
        enabledSources: [buildGitHubSource({ id: 1 }), buildGitHubSource({ id: 3 }), buildWebsiteSource({ id: 2 })],
      })
      collectGitHubSourceMock.mockRejectedValueOnce(new GitHubRateLimitError("/x"))
      collectWebsiteSourceMock.mockResolvedValueOnce(buildCompletedResult(1))

      const result = await collectPassages(buildInput(), repo, createDeps(createFakeGitHubClient()))

      expect(collectGitHubSourceMock).toHaveBeenCalledTimes(1)
      expect(collectWebsiteSourceMock).toHaveBeenCalledTimes(1)
      expect(result.results.map(({ sourceId }) => sourceId)).toEqual([2])
    })

    it("website のソースが throw したら failedSourceIds に入る（BlockedUrlError・robots.txt の読込み失敗など）", async () => {
      const repo = createFakeRepo({ enabledSources: [buildWebsiteSource({ id: 2 })] })
      collectWebsiteSourceMock.mockRejectedValueOnce(new Error("Failed to fetch robots.txt: 500"))

      const result = await collectPassages(buildInput(), repo, createDeps(createFakeGitHubClient()))

      expect(result.failedSourceIds).toEqual([2])
    })

    it("--source-id の指定があれば findById のソースだけを処理する", async () => {
      const source = buildGitHubSource({ id: 7 })
      const repo = createFakeRepo({ source })
      collectGitHubSourceMock.mockResolvedValueOnce(buildCompletedResult(1))

      await collectPassages(buildInput({ sourceId: 7 }), repo, createDeps(createFakeGitHubClient()))

      expect(repo.contentSourceRepository.findById).toHaveBeenCalledWith(7)
      expect(repo.contentSourceRepository.findEnabled).not.toHaveBeenCalled()
      expect(collectGitHubSourceMock.mock.calls[0][0].source).toBe(source)
    })

    it("停止指示を受けたら次のソースへ進まない", async () => {
      const repo = createFakeRepo({ enabledSources: [buildGitHubSource({ id: 1 }), buildGitHubSource({ id: 2 })] })
      let isShuttingDown = false
      collectGitHubSourceMock.mockImplementationOnce(async () => {
        isShuttingDown = true
        return buildCompletedResult(1)
      })

      await collectPassages(buildInput(), repo, createDeps(createFakeGitHubClient(), () => isShuttingDown))

      expect(collectGitHubSourceMock).toHaveBeenCalledTimes(1)
    })
  })

  describe("異常系", () => {
    it("--source-id のソースが存在しなければ throw する", async () => {
      const repo = createFakeRepo({ source: null })

      await expect(collectPassages(buildInput({ sourceId: 99 }), repo, createDeps(createFakeGitHubClient())))
        .rejects.toThrow("Content source not found: id=99")
      expect(collectGitHubSourceMock).not.toHaveBeenCalled()
    })

    it("--source-id のソースが無効なら throw する（無効のソースは --dry-run でだけ扱える）", async () => {
      const repo = createFakeRepo({ source: buildGitHubSource({ id: 5, isEnabled: false }) })

      await expect(collectPassages(buildInput({ sourceId: 5 }), repo, createDeps(createFakeGitHubClient())))
        .rejects.toThrow("Content source is disabled: id=5")
      expect(collectGitHubSourceMock).not.toHaveBeenCalled()
    })
  })
})
