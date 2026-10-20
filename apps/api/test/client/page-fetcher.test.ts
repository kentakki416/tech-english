import {
  BlockedUrlError,
  CrawlDelayTooLongError,
  EXTRACTION_VERSION,
  type FetchPageResult,
  type IWebPageClient,
  WebDeadlineExceededError,
  WebSourceThrottledError,
} from "@repo/content-extractor"

import { PageFetcher } from "../../src/client/page-fetcher"
import { buildWebsiteSource } from "../service/content-source-service/fixtures"

/**
 * サイトへのリクエスト（WebPageClient）だけを fake にし、URL の正規化・対象パスの判定・本文の抽出は本物を使う
 */
const mocks = vi.hoisted(() => {
  const client = {
    fetchPage: vi.fn<IWebPageClient["fetchPage"]>(),
    fetchSitemapUrls: vi.fn<IWebPageClient["fetchSitemapUrls"]>(),
    isAllowedByRobots: vi.fn<IWebPageClient["isAllowedByRobots"]>(),
    loadRobots: vi.fn<IWebPageClient["loadRobots"]>(),
  }
  /**
   * new で呼ばれるので、アロー関数ではなく class にする（constructor が返したオブジェクトが new の結果になる）
   */
  const FakeWebPageClient = class {
    constructor() {
      return client
    }
  }
  return { client, WebPageClient: vi.fn(FakeWebPageClient) }
})

vi.mock(import("@repo/content-extractor"), async (importOriginal) => ({
  ...(await importOriginal()),
  WebPageClient: mocks.WebPageClient as unknown as typeof import("@repo/content-extractor").WebPageClient,
}))

const NOW = new Date("2026-10-20T03:00:00.000Z")
const PAGE_URL = "https://go.dev/doc/tutorial/getting-started"
const SOURCE = buildWebsiteSource()

const PARAGRAPH = "In this tutorial, you'll get a brief introduction to Go programming. Along the way, you will install Go, "
  + "write some simple hello world code, use the go command to run your code, use the Go package discovery tool to find "
  + "packages you can use in your own code, and call functions of an external module. "

const PAGE_HTML = `<!doctype html><html lang="en"><head><title>Tutorial: Get started with Go</title></head><body>
<main><article>
<h1>Tutorial: Get started with Go</h1>
<h2>Install Go</h2>
<p>${PARAGRAPH.repeat(2)}</p>
</article></main>
</body></html>`

const buildOkResult = (overrides: Partial<Extract<FetchPageResult, { kind: "ok" }>> = {}): FetchPageResult => ({
  body: PAGE_HTML,
  etag: "\"etag-1\"",
  finalUrl: PAGE_URL,
  kind: "ok",
  lastModified: "Mon, 19 Oct 2026 00:00:00 GMT",
  status: 200,
  ...overrides,
})

const pageFetcher = new PageFetcher("https://tech-english.example.com")

const fetchAndExtract = async (url = PAGE_URL) => pageFetcher.fetchAndExtractPage({ now: NOW, source: SOURCE, url })

describe("PageFetcher.fetchAndExtractPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.client.loadRobots.mockResolvedValue()
    mocks.client.isAllowedByRobots.mockReturnValue(true)
    mocks.client.fetchPage.mockResolvedValue(buildOkResult())
  })

  describe("正常系", () => {
    it("クエリとフラグメントを除いた URL を、期限・Crawl-delay の上限・間隔を付けたクライアントで条件なしに取得して抽出する", async () => {
      const result = await fetchAndExtract(`${PAGE_URL}?lang=en#install`)

      expect(mocks.WebPageClient).toHaveBeenCalledWith({
        allowedOrigin: "https://go.dev",
        deadlineAt: NOW.getTime() + 20_000,
        maxCrawlDelaySeconds: 10,
        requestIntervalMs: 1000,
        userAgent: "TechEnglishBot/1.0 (+https://tech-english.example.com)",
      })
      expect(mocks.client.isAllowedByRobots).toHaveBeenCalledWith(PAGE_URL)
      expect(mocks.client.fetchPage).toHaveBeenCalledWith(PAGE_URL, { etag: null, lastModified: null })
      expect(result).toMatchObject({
        kind: "ok",
        page: {
          contentHash: expect.any(String),
          etag: "\"etag-1\"",
          extractionVersion: EXTRACTION_VERSION,
          httpStatus: 200,
          lastModified: "Mon, 19 Oct 2026 00:00:00 GMT",
          normalizedUrl: PAGE_URL,
          path: "/doc/tutorial/getting-started",
          title: "Tutorial: Get started with Go",
        },
      })
      expect(result.kind === "ok" && result.page.chunks.length).toBeGreaterThan(0)
    })

    it("連絡先の URL が無ければ User-Agent は TechEnglishBot/1.0 だけ", async () => {
      await new PageFetcher(undefined).fetchAndExtractPage({ now: NOW, source: SOURCE, url: PAGE_URL })

      expect(mocks.WebPageClient).toHaveBeenCalledWith(expect.objectContaining({ userAgent: "TechEnglishBot/1.0" }))
    })
  })

  describe("異常系", () => {
    it.each([
      ["対象パスの外", "https://go.dev/blog/"],
      ["除外パス", "https://go.dev/doc/devel/release"],
      ["ページでない拡張子", "https://go.dev/doc/gopher/frontpage.png"],
    ])("%s の URL は out_of_target_path で、サイトにリクエストしない", async (_label, url) => {
      const result = await fetchAndExtract(url)

      expect(result).toEqual({ code: "out_of_target_path", detail: null, kind: "failed" })
      expect(mocks.WebPageClient).not.toHaveBeenCalled()
    })

    it("正規化できない URL は blocked_url", async () => {
      const result = await fetchAndExtract("http://go.dev/doc/")

      expect(result).toEqual({ code: "blocked_url", detail: null, kind: "failed" })
      expect(mocks.WebPageClient).not.toHaveBeenCalled()
    })

    it.each([
      ["読めない（5xx・ネットワークエラー）", new Error("Failed to fetch robots.txt: 500"), "robots_unavailable"],
      ["Crawl-delay が上限を超える", new CrawlDelayTooLongError({ crawlDelaySeconds: 20, maxCrawlDelaySeconds: 10, url: PAGE_URL }), "crawl_delay_too_long"],
      ["429 / 503", new WebSourceThrottledError({ retryAfter: null, status: 429, url: PAGE_URL }), "throttled"],
      ["期限を過ぎる", new WebDeadlineExceededError({ deadlineAt: NOW.getTime(), url: PAGE_URL }), "deadline_exceeded"],
    ] as const)("robots.txt が %s なら %s で、ページを取得しない", async (_label, error, code) => {
      mocks.client.loadRobots.mockRejectedValue(error)

      const result = await fetchAndExtract()

      expect(result).toEqual({ code, detail: expect.any(String), kind: "failed" })
      expect(mocks.client.fetchPage).not.toHaveBeenCalled()
    })

    it("robots.txt で禁止されていれば robots_disallowed で、ページを取得しない", async () => {
      mocks.client.isAllowedByRobots.mockReturnValue(false)

      const result = await fetchAndExtract()

      expect(result).toEqual({ code: "robots_disallowed", detail: null, kind: "failed" })
      expect(mocks.client.fetchPage).not.toHaveBeenCalled()
    })

    it.each([
      [{ kind: "http_error", status: 404 }, { code: "http_error", detail: "404" }],
      [{ errorMessage: "timeout", kind: "network_error" }, { code: "network_error", detail: "timeout" }],
      [{ kind: "skipped", reason: "not_html", status: 200 }, { code: "not_html", detail: null }],
      [{ kind: "skipped", reason: "too_large", status: 200 }, { code: "too_large", detail: null }],
      [{ kind: "skipped", reason: "redirect_not_allowed", status: 301 }, { code: "redirect_not_allowed", detail: null }],
      [{ kind: "skipped", reason: "too_many_redirects", status: 301 }, { code: "too_many_redirects", detail: null }],
      [{ kind: "skipped", reason: "robots_disallowed", status: 301 }, { code: "robots_disallowed", detail: null }],
    ] satisfies [FetchPageResult, object][])("取得の結果が %o なら %o", async (fetched, expected) => {
      mocks.client.fetchPage.mockResolvedValue(fetched)

      const result = await fetchAndExtract()

      expect(result).toEqual({ ...expected, kind: "failed" })
    })

    it.each([
      ["取得先の制限", new BlockedUrlError("https://10.0.0.1/"), "blocked_url"],
      ["429 / 503", new WebSourceThrottledError({ retryAfter: "60", status: 503, url: PAGE_URL }), "throttled"],
      ["期限", new WebDeadlineExceededError({ deadlineAt: NOW.getTime(), url: PAGE_URL }), "deadline_exceeded"],
    ] as const)("ページの取得で %s のエラーなら %s", async (_label, error, code) => {
      mocks.client.fetchPage.mockRejectedValue(error)

      const result = await fetchAndExtract()

      expect(result).toEqual({ code, detail: expect.any(String), kind: "failed" })
    })

    it("ページの取得で想定外のエラーが throw されたら伝播する", async () => {
      mocks.client.fetchPage.mockRejectedValue(new Error("unexpected"))

      await expect(fetchAndExtract()).rejects.toThrow("unexpected")
    })

    it("リダイレクトの行き先が除外パスなら redirected_out_of_target", async () => {
      mocks.client.fetchPage.mockResolvedValue(buildOkResult({ finalUrl: "https://go.dev/doc/devel/release" }))

      const result = await fetchAndExtract()

      expect(result).toEqual({ code: "redirected_out_of_target", detail: "https://go.dev/doc/devel/release", kind: "failed" })
    })

    it("本文を抽出できなければ（不正な CSS セレクタ）extraction_failed", async () => {
      const result = await pageFetcher.fetchAndExtractPage({
        now: NOW,
        source: buildWebsiteSource({ contentSelector: "main[" }),
        url: PAGE_URL,
      })

      expect(result).toEqual({ code: "extraction_failed", detail: expect.any(String), kind: "failed" })
    })
  })
})
