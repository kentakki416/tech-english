import { BlockedUrlError, WebSourceThrottledError } from "../../../src/client/web"
import { collectWebsiteSource, type CollectWebsiteSourceInput, extractWebPage } from "../../../src/service/collection"

import {
  buildHtmlPage,
  buildOkPage,
  buildSourceDocument,
  buildWebsiteSource,
  createDeps,
  createFakeGitHubClient,
  createFakeRepo,
  createFakeWebPageClient,
  type FakeWebPageClientOptions,
  NOW,
} from "./helpers"

/**
 * Retry-After の warn を確かめるため logger を差し替える（@repo/logger の logger は Proxy で spyOn できない）
 */
const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }))
vi.mock("@repo/logger", () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: warnMock } }))

const SITE = "https://example.dev"

const SOURCE = buildWebsiteSource({
  contentSelector: "main",
  id: 2,
  includeGlobs: ["/doc/**"],
  siteUrl: SITE,
  sitemapUrl: null,
  startUrl: null,
})

const buildInput = (overrides: Partial<CollectWebsiteSourceInput> = {}): CollectWebsiteSourceInput => ({
  maxDocuments: 100,
  maxPassages: 200,
  now: NOW,
  refetchDays: 7,
  source: SOURCE,
  ...overrides,
})

const setup = (options: {
  client?: FakeWebPageClientOptions
  isShuttingDown?: () => boolean
  queue?: ReturnType<typeof buildSourceDocument>[]
} = {}) => {
  const client = createFakeWebPageClient(options.client)
  const repo = createFakeRepo({ queue: options.queue ?? [] })
  const deps = createDeps(createFakeGitHubClient(), options.isShuttingDown, client)
  return { client, deps, repo }
}

const buildQueuedDocument = (id: number, path: string, overrides: Parameters<typeof buildSourceDocument>[0] = {}) =>
  buildSourceDocument({ id, path, sourceId: SOURCE.id, ...overrides })

describe("collectWebsiteSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("robots.txt を読んでから、sitemap の URL を対象パス・オリジン・robots・拡張子で絞って upsertDiscovered し、start_url の path も入れる", async () => {
      const older = new Date("2026-09-01T00:00:00.000Z")
      const newer = new Date("2026-10-01T00:00:00.000Z")
      const source = { ...SOURCE, sitemapUrl: `${SITE}/sitemap.xml`, startUrl: `${SITE}/start/?ref=nav` }
      const { client, deps, repo } = setup({
        client: {
          disallowedPathPrefixes: ["/doc/secret"],
          sitemapUrls: [
            { lastmod: older, url: `${SITE}/doc/a` },
            { lastmod: newer, url: `${SITE}/doc/a?lang=en#top` },
            { lastmod: null, url: `${SITE}/doc/b` },
            { lastmod: null, url: `${SITE}/blog/post` },
            { lastmod: null, url: "https://other.dev/doc/c" },
            { lastmod: null, url: "http://example.dev/doc/d" },
            { lastmod: null, url: `${SITE}/doc/secret/e` },
            { lastmod: null, url: `${SITE}/doc/manual.pdf` },
          ],
        },
      })

      const result = await collectWebsiteSource(buildInput({ source }), repo, deps)

      expect(deps.createWebPageClient).toHaveBeenCalledWith(SITE)
      expect(client.loadRobots.mock.invocationCallOrder[0]).toBeLessThan(client.fetchSitemapUrls.mock.invocationCallOrder[0])
      expect(client.fetchSitemapUrls).toHaveBeenCalledWith(`${SITE}/sitemap.xml`)
      expect(repo.sourceDocumentRepository.upsertDiscovered.mock.calls).toEqual([
        [2, [{ path: "/doc/a", sitemapLastmod: newer }, { path: "/doc/b", sitemapLastmod: null }], { shouldReviveGone: false }],
        [2, [{ path: "/start/", sitemapLastmod: null }], { shouldReviveGone: false }],
      ])
      expect(result).toEqual({ createdPassageCount: 0, fetchedDocumentCount: 0, status: "completed" })
      expect(repo.contentSourceRepository.markCollected).toHaveBeenCalledWith(2, { lastCollectedAt: NOW })
    })

    it("findFetchQueue を refetchBefore = now - refetchDays 日、limit = maxDocuments で呼ぶ", async () => {
      const { deps, repo } = setup()

      await collectWebsiteSource(buildInput({ maxDocuments: 30, refetchDays: 7 }), repo, deps)

      expect(repo.sourceDocumentRepository.findFetchQueue).toHaveBeenCalledWith({
        limit: 30,
        refetchBefore: new Date("2026-10-03T03:00:00.000Z"),
        sourceId: 2,
      })
    })

    it("前回の ETag / Last-Modified で条件付きリクエストし、304 は本文を解析せず markResponse(304)", async () => {
      const document = buildQueuedDocument(10, "/doc/a", { etag: "\"v1\"", lastModified: "Sat, 03 Oct 2026 00:00:00 GMT" })
      const { client, deps, repo } = setup({
        client: { pages: { [`${SITE}/doc/a`]: { kind: "not_modified", status: 304 } } },
        queue: [document],
      })

      const result = await collectWebsiteSource(buildInput(), repo, deps)

      expect(client.fetchPage).toHaveBeenCalledWith(`${SITE}/doc/a`, { etag: "\"v1\"", lastModified: "Sat, 03 Oct 2026 00:00:00 GMT" })
      expect(repo.sourceDocumentRepository.markResponse).toHaveBeenCalledWith(10, { fetchedAt: NOW, httpStatus: 304 })
      expect(repo.sourceDocumentRepository.markFetched).not.toHaveBeenCalled()
      expect(repo.passageRepository.insertIgnoringDuplicates).not.toHaveBeenCalled()
      expect(result).toEqual({ createdPassageCount: 0, fetchedDocumentCount: 1, status: "completed" })
    })

    it("200 の新しい本文は sourceCommitSha: null の本文候補になり、リンクは shouldReviveGone: true で入り、最後に markFetched する", async () => {
      const html = buildHtmlPage({
        links: ["/doc/b", "../c?x=1", "/blog/post", "https://other.dev/doc/d", "/doc/secret/e", "/doc/a"],
        sectionTitles: ["Alpha", "Beta"],
        title: "Page A",
      })
      const { deps, repo } = setup({
        client: {
          disallowedPathPrefixes: ["/doc/secret"],
          pages: {
            [`${SITE}/doc/a`]: buildOkPage(`${SITE}/doc/a/`, html, {
              etag: "\"v2\"",
              lastModified: "Sat, 10 Oct 2026 00:00:00 GMT",
            }),
          },
        },
        queue: [buildQueuedDocument(10, "/doc/a", { contentHash: "old-hash" })],
      })

      const result = await collectWebsiteSource(buildInput(), repo, deps)

      expect(repo.sourceDocumentRepository.upsertDiscovered).toHaveBeenCalledWith(
        2,
        [{ path: "/doc/b", sitemapLastmod: null }, { path: "/doc/c", sitemapLastmod: null }, { path: "/doc/a", sitemapLastmod: null }],
        { shouldReviveGone: true },
      )
      const [inputs] = repo.passageRepository.insertIgnoringDuplicates.mock.calls[0]
      expect(inputs.map(({ title }) => title)).toEqual(["Page A", "Beta"])
      expect(inputs[0]).toMatchObject({
        sourceCommitSha: null,
        sourceDocumentId: 10,
        sourcePath: "/doc/a",
        sourceRetrievedAt: NOW,
      })
      const extracted = extractWebPage(SOURCE, { body: html, finalUrl: `${SITE}/doc/a/`, path: "/doc/a" })
      expect(repo.sourceDocumentRepository.markFetched).toHaveBeenCalledWith(10, {
        blobSha: null,
        commitSha: null,
        contentHash: extracted.contentHash,
        etag: "\"v2\"",
        fetchedAt: NOW,
        httpStatus: 200,
        lastModified: "Sat, 10 Oct 2026 00:00:00 GMT",
        title: "Page A",
      })
      expect(repo.passageRepository.insertIgnoringDuplicates.mock.invocationCallOrder[0])
        .toBeLessThan(repo.sourceDocumentRepository.markFetched.mock.invocationCallOrder[0])
      expect(result).toEqual({ createdPassageCount: 2, fetchedDocumentCount: 1, status: "completed" })
    })

    it("200 でも本文のハッシュが前回と同じなら本文候補を作らず、markFetched だけする", async () => {
      const html = buildHtmlPage({ sectionTitles: ["Alpha"] })
      const contentHash = extractWebPage(SOURCE, { body: html, finalUrl: `${SITE}/doc/a`, path: "/doc/a" }).contentHash
      const { deps, repo } = setup({
        client: { pages: { [`${SITE}/doc/a`]: buildOkPage(`${SITE}/doc/a`, html) } },
        queue: [buildQueuedDocument(10, "/doc/a", { contentHash })],
      })

      const result = await collectWebsiteSource(buildInput(), repo, deps)

      expect(repo.passageRepository.insertIgnoringDuplicates).not.toHaveBeenCalled()
      expect(repo.sourceDocumentRepository.markFetched).toHaveBeenCalledWith(10, expect.objectContaining({ contentHash, httpStatus: 200 }))
      expect(result.createdPassageCount).toBe(0)
    })

    it("対象パス外の開始ページはリンクだけ入れて本文候補を作らない", async () => {
      const html = buildHtmlPage({ links: ["/doc/intro", "/doc/install"], sectionTitles: ["Welcome"] })
      const { deps, repo } = setup({
        client: { pages: { [`${SITE}/start/`]: buildOkPage(`${SITE}/start/`, html) } },
        queue: [buildQueuedDocument(11, "/start/")],
      })

      await collectWebsiteSource(buildInput(), repo, deps)

      expect(repo.sourceDocumentRepository.upsertDiscovered).toHaveBeenCalledWith(
        2,
        [{ path: "/doc/intro", sitemapLastmod: null }, { path: "/doc/install", sitemapLastmod: null }],
        { shouldReviveGone: true },
      )
      expect(repo.passageRepository.insertIgnoringDuplicates).not.toHaveBeenCalled()
      expect(repo.sourceDocumentRepository.markFetched).toHaveBeenCalledWith(11, expect.objectContaining({ httpStatus: 200 }))
    })

    it("本文の抽出が throw したページ（不正な CSS セレクタ）は本文候補 0 件で markFetched する", async () => {
      const source = { ...SOURCE, contentSelector: "main[[" }
      const { deps, repo } = setup({
        client: { pages: { [`${SITE}/doc/a`]: buildOkPage(`${SITE}/doc/a`, buildHtmlPage({ sectionTitles: ["Alpha"] })) } },
        queue: [buildQueuedDocument(10, "/doc/a")],
      })

      const result = await collectWebsiteSource(buildInput({ source }), repo, deps)

      expect(repo.passageRepository.insertIgnoringDuplicates).not.toHaveBeenCalled()
      expect(repo.sourceDocumentRepository.markFetched).toHaveBeenCalledWith(10, expect.objectContaining({ contentHash: null, title: null }))
      expect(result.status).toBe("completed")
    })

    it("404 / skipped は markResponse に status を記録する（robots で取得しなかったものは null）", async () => {
      const { deps, repo } = setup({
        client: {
          pages: {
            [`${SITE}/doc/gone`]: { kind: "http_error", status: 404 },
            [`${SITE}/doc/pdf`]: { kind: "skipped", reason: "not_html", status: 200 },
            [`${SITE}/doc/private`]: { kind: "skipped", reason: "robots_disallowed", status: null },
          },
        },
        queue: [buildQueuedDocument(1, "/doc/gone"), buildQueuedDocument(2, "/doc/pdf"), buildQueuedDocument(3, "/doc/private")],
      })

      const result = await collectWebsiteSource(buildInput(), repo, deps)

      expect(repo.sourceDocumentRepository.markResponse.mock.calls).toEqual([
        [1, { fetchedAt: NOW, httpStatus: 404 }],
        [2, { fetchedAt: NOW, httpStatus: 200 }],
        [3, { fetchedAt: NOW, httpStatus: null }],
      ])
      expect(result).toEqual({ createdPassageCount: 0, fetchedDocumentCount: 3, status: "completed" })
    })

    it("429 / 503（WebSourceThrottledError）で残りの行を取得せずに throttled を返し、markCollected する", async () => {
      const { client, deps, repo } = setup({
        client: {
          pages: {
            [`${SITE}/doc/a`]: { kind: "not_modified", status: 304 },
            [`${SITE}/doc/b`]: new WebSourceThrottledError({ retryAfter: "120", status: 429, url: `${SITE}/doc/b` }),
            [`${SITE}/doc/c`]: { kind: "not_modified", status: 304 },
          },
        },
        queue: [buildQueuedDocument(1, "/doc/a"), buildQueuedDocument(2, "/doc/b"), buildQueuedDocument(3, "/doc/c")],
      })

      const result = await collectWebsiteSource(buildInput(), repo, deps)

      expect(result).toEqual({ createdPassageCount: 0, fetchedDocumentCount: 1, status: "throttled" })
      expect(client.fetchPage).toHaveBeenCalledTimes(2)
      expect(repo.contentSourceRepository.markCollected).toHaveBeenCalledWith(2, { lastCollectedAt: NOW })
    })

    it("Retry-After が次回の実行（24 時間後）より先なら warn を出す", async () => {
      const { deps, repo } = setup({
        client: {
          pages: {
            [`${SITE}/doc/a`]: new WebSourceThrottledError({ retryAfter: String(2 * 24 * 60 * 60), status: 503, url: `${SITE}/doc/a` }),
          },
        },
        queue: [buildQueuedDocument(1, "/doc/a")],
      })

      await collectWebsiteSource(buildInput(), repo, deps)

      expect(warnMock).toHaveBeenCalledWith("Retry-After is later than the next run", expect.objectContaining({ sourceId: 2 }))
    })

    it("Retry-After が次回の実行より前なら Retry-After の warn は出さない", async () => {
      const { deps, repo } = setup({
        client: {
          pages: { [`${SITE}/doc/a`]: new WebSourceThrottledError({ retryAfter: "3600", status: 503, url: `${SITE}/doc/a` }) },
        },
        queue: [buildQueuedDocument(1, "/doc/a")],
      })

      await collectWebsiteSource(buildInput(), repo, deps)

      expect(warnMock).not.toHaveBeenCalledWith("Retry-After is later than the next run", expect.anything())
    })

    it("robots.txt の 429 / 503 も throttled にする", async () => {
      const { deps, repo } = setup({
        client: { loadRobotsError: new WebSourceThrottledError({ retryAfter: null, status: 503, url: `${SITE}/robots.txt` }) },
      })

      const result = await collectWebsiteSource(buildInput(), repo, deps)

      expect(result.status).toBe("throttled")
      expect(repo.sourceDocumentRepository.findFetchQueue).not.toHaveBeenCalled()
    })

    it("network_error は何も更新せず、間に ok を挟むと連続の回数を数え直す", async () => {
      const html = buildHtmlPage({ sectionTitles: ["Alpha"] })
      const { deps, repo } = setup({
        client: {
          pages: {
            [`${SITE}/doc/1`]: { errorMessage: "timeout", kind: "network_error" },
            [`${SITE}/doc/2`]: { errorMessage: "timeout", kind: "network_error" },
            [`${SITE}/doc/3`]: buildOkPage(`${SITE}/doc/3`, html),
            [`${SITE}/doc/4`]: { errorMessage: "timeout", kind: "network_error" },
            [`${SITE}/doc/5`]: { errorMessage: "timeout", kind: "network_error" },
          },
        },
        queue: [1, 2, 3, 4, 5].map((id) => buildQueuedDocument(id, `/doc/${id}`)),
      })

      const result = await collectWebsiteSource(buildInput(), repo, deps)

      expect(result).toEqual({ createdPassageCount: 1, fetchedDocumentCount: 1, status: "completed" })
      expect(repo.sourceDocumentRepository.markResponse).not.toHaveBeenCalled()
      expect(repo.sourceDocumentRepository.markFetched).toHaveBeenCalledTimes(1)
    })

    it("取得待ちの行が maxDocuments 件あれば limit_reached", async () => {
      const { deps, repo } = setup({
        client: { pages: { [`${SITE}/doc/a`]: { kind: "not_modified", status: 304 }, [`${SITE}/doc/b`]: { kind: "not_modified", status: 304 } } },
        queue: [buildQueuedDocument(1, "/doc/a"), buildQueuedDocument(2, "/doc/b")],
      })

      const result = await collectWebsiteSource(buildInput({ maxDocuments: 2 }), repo, deps)

      expect(result.status).toBe("limit_reached")
    })

    it("本文候補の上限に達したら残りの行を取得せず limit_reached", async () => {
      const { client, deps, repo } = setup({
        client: { pages: { [`${SITE}/doc/a`]: buildOkPage(`${SITE}/doc/a`, buildHtmlPage({ sectionTitles: ["Alpha", "Beta"] })) } },
        queue: [buildQueuedDocument(1, "/doc/a"), buildQueuedDocument(2, "/doc/b")],
      })

      const result = await collectWebsiteSource(buildInput({ maxPassages: 2 }), repo, deps)

      expect(result).toEqual({ createdPassageCount: 2, fetchedDocumentCount: 1, status: "limit_reached" })
      expect(client.fetchPage).toHaveBeenCalledTimes(1)
    })

    it("停止指示を受けたら interrupted", async () => {
      const { client, deps, repo } = setup({ isShuttingDown: () => true, queue: [buildQueuedDocument(1, "/doc/a")] })

      const result = await collectWebsiteSource(buildInput(), repo, deps)

      expect(result.status).toBe("interrupted")
      expect(client.fetchPage).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("network_error が 3 回続いたら throw する", async () => {
      const { client, deps, repo } = setup({
        client: {
          pages: Object.fromEntries([1, 2, 3, 4].map((id) => [`${SITE}/doc/${id}`, { errorMessage: "ECONNRESET", kind: "network_error" as const }])),
        },
        queue: [1, 2, 3, 4].map((id) => buildQueuedDocument(id, `/doc/${id}`)),
      })

      await expect(collectWebsiteSource(buildInput(), repo, deps)).rejects.toThrow("Network errors occurred 3 times in a row")
      expect(client.fetchPage).toHaveBeenCalledTimes(3)
      expect(repo.contentSourceRepository.markCollected).not.toHaveBeenCalled()
    })

    it("BlockedUrlError はそのまま throw される", async () => {
      const { deps, repo } = setup({
        client: { pages: { [`${SITE}/doc/a`]: new BlockedUrlError("example.dev") } },
        queue: [buildQueuedDocument(1, "/doc/a")],
      })

      await expect(collectWebsiteSource(buildInput(), repo, deps)).rejects.toBeInstanceOf(BlockedUrlError)
    })

    it("robots.txt の読込み失敗は throw され、sitemap も取得しない", async () => {
      const { client, deps, repo } = setup({ client: { loadRobotsError: new Error("Failed to fetch robots.txt: 500") } })

      await expect(collectWebsiteSource(buildInput({ source: { ...SOURCE, sitemapUrl: `${SITE}/sitemap.xml` } }), repo, deps))
        .rejects.toThrow("Failed to fetch robots.txt: 500")
      expect(client.fetchSitemapUrls).not.toHaveBeenCalled()
    })

    it("start_url がサイトの外を指していれば BlockedUrlError", async () => {
      const { deps, repo } = setup()

      await expect(collectWebsiteSource(buildInput({ source: { ...SOURCE, startUrl: "https://other.dev/doc/" } }), repo, deps))
        .rejects.toBeInstanceOf(BlockedUrlError)
      expect(repo.sourceDocumentRepository.upsertDiscovered).not.toHaveBeenCalled()
    })
  })
})
