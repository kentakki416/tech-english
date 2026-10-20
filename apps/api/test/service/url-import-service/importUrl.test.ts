import { SUPERSEDED_PASSAGE_REJECT_REASON } from "@repo/domain"

import type { TransactionContext, TransactionRunner } from "../../../src/repository"
import { importUrl } from "../../../src/service/url-import-service"
import { buildChunk, buildFetchedPage } from "../../fixture/url-import"
import { buildWebsiteSource, createMockContentSourceRepository } from "../content-source-service/fixtures"

import { buildImportPassage, createMockPageFetcher, createMockUrlImportRepository } from "./fixtures"

const NOW = new Date("2026-10-20T03:00:00.000Z")
const PAGE_URL = "https://go.dev/doc/tutorial/getting-started"
const DOCUMENT_ID = 30

const TX = { fake: "tx" } as unknown as TransactionContext
const transactionRunner: TransactionRunner = { run: vi.fn(async (fn) => fn(TX)) }
const contentSourceRepository = createMockContentSourceRepository()
const urlImportRepository = createMockUrlImportRepository()
const pageFetcher = createMockPageFetcher()
const repo = { contentSourceRepository, transactionRunner, urlImportRepository }
const deps = { pageFetcher }

describe("importUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contentSourceRepository.findAll.mockResolvedValue([buildWebsiteSource()])
    urlImportRepository.upsertFetchedDocument.mockResolvedValue({ id: DOCUMENT_ID })
    urlImportRepository.findDocumentPassages.mockResolvedValue([])
    urlImportRepository.insertCandidates.mockResolvedValue([])
    urlImportRepository.prioritizeCollected.mockResolvedValue([])
    urlImportRepository.rejectCollected.mockResolvedValue(0)
  })

  describe("正常系", () => {
    it("文書を記録し、同じ見出しの問題がある塊と条件を満たさない塊を除いて、生成を優先した本文候補として保存する", async () => {
      const page = buildFetchedPage({
        chunks: [
          buildChunk({ contentHash: "hash-short", rejectReasons: ["too_short"], title: "Short" }),
          buildChunk({ contentHash: "hash-drafted", title: "Drafted" }),
          buildChunk({ contentHash: "hash-existing", title: "Existing" }),
          buildChunk({ contentHash: "hash-new", title: "New" }),
        ],
      })
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ kind: "ok", page })
      urlImportRepository.findDocumentPassages.mockResolvedValue([
        buildImportPassage({ id: 1, contentHash: "hash-old-draft", status: "draft", title: "Drafted" }),
      ])
      urlImportRepository.insertCandidates.mockResolvedValue([101])
      urlImportRepository.prioritizeCollected.mockResolvedValue([
        { id: 101, contentHash: "hash-new", title: "New" },
        { id: 50, contentHash: "hash-existing", title: "Existing" },
      ])
      urlImportRepository.rejectCollected.mockResolvedValue(2)

      const result = await importUrl(PAGE_URL, NOW, repo, deps)

      expect(result).toEqual({
        ok: true,
        value: {
          createdCount: 1,
          passages: [
            { id: 50, isNew: false, title: "Existing" },
            { id: 101, isNew: true, title: "New" },
          ],
          rejectedCount: 2,
          sourceDocumentId: DOCUMENT_ID,
          sourceId: 2,
        },
      })
      expect(transactionRunner.run).toHaveBeenCalledTimes(1)
      expect(urlImportRepository.upsertFetchedDocument).toHaveBeenCalledWith({
        contentHash: "hash-page",
        etag: "\"etag-1\"",
        extractionVersion: "2026-10-18",
        fetchedAt: NOW,
        httpStatus: 200,
        lastModified: "Mon, 19 Oct 2026 00:00:00 GMT",
        path: "/doc/tutorial/getting-started",
        sourceId: 2,
        title: "Tutorial: Get started with Go",
      }, TX)
      expect(urlImportRepository.findDocumentPassages).toHaveBeenCalledWith({ path: "/doc/tutorial/getting-started", sourceId: 2 }, TX)
      expect(urlImportRepository.insertCandidates).toHaveBeenCalledWith(
        ["Existing", "New"].map((title) => ({
          blocks: buildChunk().blocks,
          contentHash: `hash-${title.toLowerCase()}`,
          generationPrioritizedAt: NOW,
          sourceDocumentId: DOCUMENT_ID,
          sourcePath: "/doc/tutorial/getting-started",
          sourceRetrievedAt: NOW,
          title,
          wordCount: 150,
        })),
        TX,
      )
      expect(urlImportRepository.prioritizeCollected).toHaveBeenCalledWith({ contentHashes: ["hash-existing", "hash-new"], now: NOW }, TX)
      expect(urlImportRepository.rejectCollected).toHaveBeenCalledWith({
        keepContentHashes: ["hash-existing", "hash-new"],
        reason: SUPERSEDED_PASSAGE_REJECT_REASON,
        sourceDocumentId: DOCUMENT_ID,
      }, TX)
    })

    it("生成した後に却下した見出しの塊は作らず、収集が外した却下の見出しの塊は作る", async () => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({
        kind: "ok",
        page: buildFetchedPage({
          chunks: [buildChunk({ contentHash: "hash-a", title: "A" }), buildChunk({ contentHash: "hash-b", title: "B" })],
        }),
      })
      urlImportRepository.findDocumentPassages.mockResolvedValue([
        buildImportPassage({ id: 1, contentHash: "hash-old-a", generatedAt: new Date("2026-10-19T00:00:00.000Z"), status: "rejected", title: "A" }),
        buildImportPassage({ id: 2, contentHash: "hash-old-b", generatedAt: null, status: "rejected", title: "B" }),
      ])

      await importUrl(PAGE_URL, NOW, repo, deps)

      expect(urlImportRepository.insertCandidates.mock.calls[0][0].map((input) => input.title)).toEqual(["B"])
    })

    it("本文候補になる塊が 0 なら、文書は記録して前の切り分けの collected を却下し、挿入・優先は何も渡さない", async () => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({
        kind: "ok",
        page: buildFetchedPage({ chunks: [buildChunk({ rejectReasons: ["not_english"] })] }),
      })
      urlImportRepository.rejectCollected.mockResolvedValue(3)

      const result = await importUrl(PAGE_URL, NOW, repo, deps)

      expect(result).toMatchObject({ ok: true, value: { createdCount: 0, passages: [], rejectedCount: 3 } })
      expect(urlImportRepository.upsertFetchedDocument).toHaveBeenCalledTimes(1)
      expect(urlImportRepository.insertCandidates).toHaveBeenCalledWith([], TX)
      expect(urlImportRepository.prioritizeCollected).toHaveBeenCalledWith({ contentHashes: [], now: NOW }, TX)
      expect(urlImportRepository.rejectCollected).toHaveBeenCalledWith(
        { keepContentHashes: [], reason: SUPERSEDED_PASSAGE_REJECT_REASON, sourceDocumentId: DOCUMENT_ID },
        TX,
      )
    })
  })

  describe("異常系", () => {
    it("ソースが無ければ 400（source_not_found）で、トランザクションを始めない", async () => {
      contentSourceRepository.findAll.mockResolvedValue([])

      const result = await importUrl(PAGE_URL, NOW, repo, deps)

      expect(result).toMatchObject({ error: { details: [{ code: "source_not_found" }], statusCode: 400 }, ok: false })
      expect(transactionRunner.run).not.toHaveBeenCalled()
    })

    it("取得・抽出に失敗したら、その code の 400 を返し、トランザクションを始めない", async () => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ code: "robots_disallowed", detail: null, kind: "failed" })

      const result = await importUrl(PAGE_URL, NOW, repo, deps)

      expect(result).toMatchObject({ error: { details: [{ code: "robots_disallowed", path: ["url"] }], statusCode: 400 }, ok: false })
      expect(transactionRunner.run).not.toHaveBeenCalled()
    })

    it("トランザクションの中で失敗したら例外が伝播する", async () => {
      pageFetcher.fetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })
      urlImportRepository.insertCandidates.mockRejectedValue(new Error("db down"))

      await expect(importUrl(PAGE_URL, NOW, repo, deps)).rejects.toThrow()
      expect(urlImportRepository.rejectCollected).not.toHaveBeenCalled()
    })
  })
})
