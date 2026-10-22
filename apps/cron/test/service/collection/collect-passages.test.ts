import { GitHubRateLimitError } from "../../../src/client/github"
import { collectGitHubSource, collectPassages, type CollectPassagesInput } from "../../../src/service/collection"

import { buildGitHubSource, buildWebsiteSource, createDeps, createFakeGitHubClient, createFakeRepo, NOW } from "./helpers"

/**
 * 1 ソース分の収集は collect-github-source.test.ts で確かめるので、ここでは差し替えて結果だけを返す
 */
vi.mock("../../../src/service/collection/collect-github-source", () => ({ collectGitHubSource: vi.fn() }))

const collectGitHubSourceMock = vi.mocked(collectGitHubSource)

const buildInput = (overrides: Partial<CollectPassagesInput> = {}): CollectPassagesInput => ({
  githubMinRateLimitRemaining: 100,
  maxDocumentsPerSource: 100,
  maxPassagesPerRun: 200,
  now: NOW,
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

    it("GitHubRateLimitError は失敗にならず、以降のソースが飛ばされる", async () => {
      const repo = createFakeRepo({
        enabledSources: [buildGitHubSource({ id: 1 }), buildGitHubSource({ id: 2 }), buildGitHubSource({ id: 3 })],
      })
      collectGitHubSourceMock.mockResolvedValueOnce(buildCompletedResult(2)).mockRejectedValueOnce(new GitHubRateLimitError("/x"))

      const result = await collectPassages(buildInput(), repo, createDeps(createFakeGitHubClient()))

      expect(result).toEqual({ createdPassageCount: 2, failedSourceIds: [], results: [{ ...buildCompletedResult(2), sourceId: 1 }] })
      expect(collectGitHubSourceMock).toHaveBeenCalledTimes(2)
    })

    it("rate_limited で終えたソースの後も、以降のソースが飛ばされる", async () => {
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

    it("--source-id の指定があれば findById のソースだけを処理する", async () => {
      const source = buildGitHubSource({ id: 7 })
      const repo = createFakeRepo({ source })
      collectGitHubSourceMock.mockResolvedValueOnce(buildCompletedResult(1))

      await collectPassages(buildInput({ sourceId: 7 }), repo, createDeps(createFakeGitHubClient()))

      expect(repo.sourceRepository.findById).toHaveBeenCalledWith(7)
      expect(repo.sourceRepository.findEnabled).not.toHaveBeenCalled()
      expect(collectGitHubSourceMock.mock.calls[0][0].source).toBe(source)
    })
  })

  describe("異常系", () => {
    it("--source-id のソースが存在しなければ throw する", async () => {
      const repo = createFakeRepo({ source: null })

      await expect(collectPassages(buildInput({ sourceId: 99 }), repo, createDeps(createFakeGitHubClient())))
        .rejects.toThrow("Source not found: id=99")
      expect(collectGitHubSourceMock).not.toHaveBeenCalled()
    })

    it("--source-id のソースが無効なら throw する（無効のソースは --dry-run でだけ扱える）", async () => {
      const repo = createFakeRepo({ source: buildGitHubSource({ id: 5, isEnabled: false }) })

      await expect(collectPassages(buildInput({ sourceId: 5 }), repo, createDeps(createFakeGitHubClient())))
        .rejects.toThrow("Source is disabled: id=5")
      expect(collectGitHubSourceMock).not.toHaveBeenCalled()
    })

    it("--source-id にサイトのソースを指定したら、有効でも収集せずに throw する", async () => {
      const repo = createFakeRepo({ source: buildWebsiteSource({ id: 7, isEnabled: true }) })

      await expect(collectPassages(buildInput({ sourceId: 7 }), repo, createDeps(createFakeGitHubClient())))
        .rejects.toThrow("Website sources are not collected: id=7")
      expect(collectGitHubSourceMock).not.toHaveBeenCalled()
    })
  })
})
