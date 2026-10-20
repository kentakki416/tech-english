import { previewUrlImport } from "../../../src/service/url-import-service"
import { buildChunk, buildFetchedPage } from "../../fixture/url-import"
import { buildGitHubSource, buildWebsiteSource, createMockContentSourceRepository } from "../content-source-service/fixtures"

import {
  buildImportPassage,
  createMockPageFetcher,
  createMockUrlImportPageCacheRepository,
  createMockUrlImportRepository,
} from "./fixtures"

const NOW = new Date("2026-10-20T03:00:00.000Z")
const PAGE_URL = "https://go.dev/doc/tutorial/getting-started?lang=en#top"

const contentSourceRepository = createMockContentSourceRepository()
const urlImportRepository = createMockUrlImportRepository()
const urlImportPageCacheRepository = createMockUrlImportPageCacheRepository()
const pageFetcher = createMockPageFetcher()
const repo = { contentSourceRepository, urlImportPageCacheRepository, urlImportRepository }
const CACHE_KEY = { sourceId: 2, sourceUpdatedAt: buildWebsiteSource().updatedAt, url: "https://go.dev/doc/tutorial/getting-started" }
const deps = { pageFetcher }

describe("previewUrlImport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    urlImportPageCacheRepository.find.mockResolvedValue(null)
    urlImportPageCacheRepository.save.mockResolvedValue()
    contentSourceRepository.findAll.mockResolvedValue([buildGitHubSource(), buildWebsiteSource()])
    urlImportRepository.findDocumentPassages.mockResolvedValue([])
    urlImportRepository.findPassagesByContentHashes.mockResolvedValue([])
  })

  describe("正常系", () => {
    it("URL のオリジンのサイトのソースでページを取得し、ソース・ページ・塊ごとの結果を返す", async () => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result).toEqual({
        ok: true,
        value: {
          chunks: [{
            excerpt: "In this tutorial, you'll get a brief introduction to Go programming.",
            rejectReasons: [],
            sameContentPassage: null,
            status: "new",
            title: "Getting started",
            wordCount: 150,
          }],
          page: {
            normalizedUrl: "https://go.dev/doc/tutorial/getting-started",
            path: "/doc/tutorial/getting-started",
            title: "Tutorial: Get started with Go",
            wordCount: 900,
          },
          source: buildWebsiteSource(),
        },
      })
      expect(pageFetcher.fetchAndExtractPage).toHaveBeenCalledWith({ now: NOW, source: buildWebsiteSource(), url: PAGE_URL })
      expect(urlImportRepository.findDocumentPassages).toHaveBeenCalledWith({ path: "/doc/tutorial/getting-started", sourceId: 2 })
      expect(urlImportRepository.findPassagesByContentHashes).toHaveBeenCalledWith(["hash-getting-started"])
      expect(urlImportPageCacheRepository.find).toHaveBeenCalledWith(CACHE_KEY)
      expect(urlImportPageCacheRepository.save).toHaveBeenCalledWith(CACHE_KEY, buildFetchedPage())
    })

    it("キャッシュにあるページはサイトに取りに行かずに使い、キャッシュに置き直さない", async () => {
      urlImportPageCacheRepository.find.mockResolvedValue(buildFetchedPage({ title: "Cached" }))

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result.ok && result.value.page.title).toBe("Cached")
      expect(pageFetcher.fetchAndExtractPage).not.toHaveBeenCalled()
      expect(urlImportPageCacheRepository.save).not.toHaveBeenCalled()
    })

    it("キャッシュのキーの URL はクエリとフラグメントを除く", async () => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })

      await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(urlImportPageCacheRepository.find).toHaveBeenCalledWith(CACHE_KEY)
      expect(pageFetcher.fetchAndExtractPage).toHaveBeenCalledWith({ now: NOW, source: buildWebsiteSource(), url: PAGE_URL })
    })

    it("キャッシュの読み書きが 500ms で終わらなければ、待たずに取得して結果を返す", async () => {
      urlImportPageCacheRepository.find.mockReturnValue(new Promise(() => undefined))
      urlImportPageCacheRepository.save.mockReturnValue(new Promise(() => undefined))
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })
      const startedAt = Date.now()

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result.ok).toBe(true)
      expect(pageFetcher.fetchAndExtractPage).toHaveBeenCalledTimes(1)
      expect(Date.now() - startedAt).toBeLessThan(3000)
    })

    it("キャッシュの読み書きに失敗しても、取得して結果を返す", async () => {
      urlImportPageCacheRepository.find.mockRejectedValue(new Error("redis down"))
      urlImportPageCacheRepository.save.mockRejectedValue(new Error("redis down"))
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result.ok).toBe(true)
      expect(pageFetcher.fetchAndExtractPage).toHaveBeenCalledTimes(1)
    })

    it("無効のソースも当たる", async () => {
      const source = buildWebsiteSource({ isEnabled: false })
      contentSourceRepository.findAll.mockResolvedValue([source])
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result.ok).toBe(true)
      expect(pageFetcher.fetchAndExtractPage).toHaveBeenCalledWith({ now: NOW, source, url: PAGE_URL })
    })

    it("URL のオリジンは大文字・小文字を区別せずにソースのサイトの URL と比べる", async () => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })

      const result = await previewUrlImport("HTTPS://GO.DEV/doc/", NOW, repo, deps)

      expect(result.ok).toBe(true)
    })

    it("冒頭の文は最初の見出しでないブロックの先頭 160 文字（超えたら「…」を付ける）。見出しだけの塊は空", async () => {
      const longText = "a".repeat(200)
      pageFetcher.fetchAndExtractPage.mockResolvedValue({
        kind: "ok",
        page: buildFetchedPage({
          chunks: [
            buildChunk({ blocks: [{ text: "Install", type: "heading" }, { text: longText, type: "paragraph" }], contentHash: "hash-1" }),
            buildChunk({ blocks: [{ text: "Only heading", type: "heading" }], contentHash: "hash-2", rejectReasons: ["too_short"] }),
          ],
        }),
      })

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result.ok && result.value.chunks.map((chunk) => chunk.excerpt)).toEqual([`${"a".repeat(160)}…`, ""])
    })

    it("塊を、条件を満たさない・同じ見出しの問題がある・同じ内容の collected がある・同じ内容の問題がある・新しい、に分ける", async () => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({
        kind: "ok",
        page: buildFetchedPage({
          chunks: [
            buildChunk({ contentHash: "hash-short", rejectReasons: ["too_short", "too_much_code"], title: "Short" }),
            buildChunk({ contentHash: "hash-drafted-title", title: "Drafted" }),
            buildChunk({ contentHash: "hash-collected", title: "Collected" }),
            buildChunk({ contentHash: "hash-published", title: "Published elsewhere" }),
            buildChunk({ contentHash: "hash-new", title: "New" }),
          ],
        }),
      })
      urlImportRepository.findDocumentPassages.mockResolvedValue([
        buildImportPassage({ id: 1, contentHash: "hash-old-draft", status: "draft", title: "Drafted" }),
      ])
      urlImportRepository.findPassagesByContentHashes.mockResolvedValue([
        buildImportPassage({ id: 2, contentHash: "hash-collected", status: "collected", title: "Collected" }),
        buildImportPassage({ id: 3, contentHash: "hash-published", status: "published", title: "Published elsewhere" }),
      ])

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result.ok && result.value.chunks.map((chunk) => [chunk.title, chunk.status, chunk.rejectReasons, chunk.sameContentPassage])).toEqual([
        ["Short", "not_candidate", ["too_short", "too_much_code"], null],
        ["Drafted", "generated_section", [], null],
        ["Collected", "existing", [], { id: 2, status: "collected" }],
        ["Published elsewhere", "duplicated", [], { id: 3, status: "published" }],
        ["New", "new", [], null],
      ])
    })

    it("同じ見出しの問題があれば、同じ内容の collected があっても generated_section（保存しても優先しない）", async () => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })
      urlImportRepository.findDocumentPassages.mockResolvedValue([
        buildImportPassage({ id: 1, contentHash: "hash-old", status: "generating" }),
        buildImportPassage({ id: 2, status: "collected" }),
      ])
      urlImportRepository.findPassagesByContentHashes.mockResolvedValue([buildImportPassage({ id: 2, status: "collected" })])

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result.ok && result.value.chunks[0].status).toBe("generated_section")
    })

    it.each([
      ["生成した後に却下したもの（generatedAt あり）", new Date("2026-10-19T00:00:00.000Z"), "generated_section"],
      ["収集が外した却下（generatedAt なし）", null, "new"],
    ] as const)("その文書の同じ見出しの %s は %s", async (_label, generatedAt, status) => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })
      urlImportRepository.findDocumentPassages.mockResolvedValue([
        buildImportPassage({ contentHash: "hash-old", generatedAt, status: "rejected" }),
      ])

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result.ok && result.value.chunks[0].status).toBe(status)
    })
  })

  describe("異常系", () => {
    it("同じオリジンのサイトのソースが無ければ 400（source_not_found）で、ページを取得しない", async () => {
      contentSourceRepository.findAll.mockResolvedValue([buildWebsiteSource({ siteUrl: "https://example.com" })])

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result).toMatchObject({
        error: { details: [{ code: "source_not_found", path: ["url"] }], statusCode: 400, type: "BAD_REQUEST" },
        ok: false,
      })
      expect(pageFetcher.fetchAndExtractPage).not.toHaveBeenCalled()
    })

    it("GitHub のソースの公開ページのオリジンなら 400（github_source）", async () => {
      const result = await previewUrlImport("https://react.dev/learn", NOW, repo, deps)

      expect(result).toMatchObject({ error: { details: [{ code: "github_source" }], statusCode: 400 }, ok: false })
      expect(pageFetcher.fetchAndExtractPage).not.toHaveBeenCalled()
    })

    it("公開ページの URL 規則が無い GitHub のソースには当たらない（source_not_found）", async () => {
      contentSourceRepository.findAll.mockResolvedValue([buildGitHubSource({ publicUrlTemplate: null })])

      const result = await previewUrlImport("https://react.dev/learn", NOW, repo, deps)

      expect(result).toMatchObject({ error: { details: [{ code: "source_not_found" }] }, ok: false })
    })

    it.each([
      ["out_of_target_path", null],
      ["http_error", "404"],
      ["deadline_exceeded", "Fetching did not finish by the deadline"],
    ] as const)("取得・抽出が %s で失敗したら、その code の 400 を返し DB を読まない", async (code, detail) => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ code, detail, kind: "failed" })

      const result = await previewUrlImport(PAGE_URL, NOW, repo, deps)

      expect(result).toMatchObject({ error: { details: [{ code, path: ["url"] }], statusCode: 400 }, ok: false })
      expect(urlImportRepository.findDocumentPassages).not.toHaveBeenCalled()
      expect(urlImportPageCacheRepository.save).not.toHaveBeenCalled()
    })

    it("取得で想定外のエラーが throw されたら伝播する", async () => {
      pageFetcher.fetchAndExtractPage.mockRejectedValue(new Error("unexpected"))

      await expect(previewUrlImport(PAGE_URL, NOW, repo, deps)).rejects.toThrow()
    })
  })
})
