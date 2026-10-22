import { asc, eq, passages, sourceDocuments } from "@repo/db"

import { DrizzleTransactionRunner } from "../../src/repository/drizzle/transaction-runner"
import { DrizzleUrlImportRepository } from "../../src/repository/drizzle/url-import-repository"
import type { CandidateInput, FetchedDocumentInput } from "../../src/repository/url-import-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"
import { buildWebsiteSourceValues, insertPassage, insertPassageDocument, insertPassageSource } from "../fixture/passage"
import { PASSAGE_BLOCKS } from "../fixture/passage-content"

const urlImportRepository = new DrizzleUrlImportRepository(testDb)
const transactionRunner = new DrizzleTransactionRunner(testDb)

const PATH = "/doc/tutorial/getting-started"
const FETCHED_AT = new Date("2026-10-20T03:00:00.000Z")
const PRIORITIZED_AT = new Date("2026-10-20T03:00:00.123Z")
const EARLIER_PRIORITIZED_AT = new Date("2026-10-18T03:00:00.000Z")

const buildDocumentInput = (sourceId: number, overrides: Partial<FetchedDocumentInput> = {}): FetchedDocumentInput => ({
  contentHash: "hash-page-1",
  extractionVersion: "2026-10-18",
  fetchedAt: FETCHED_AT,
  path: PATH,
  sourceId,
  title: "Tutorial: Get started with Go",
  ...overrides,
})

const buildCandidateInput = (sourceDocumentId: number, overrides: Partial<CandidateInput> = {}): CandidateInput => ({
  blocks: PASSAGE_BLOCKS,
  contentHash: "hash-new",
  generationPrioritizedAt: PRIORITIZED_AT,
  sourceDocumentId,
  sourcePath: PATH,
  sourceRetrievedAt: FETCHED_AT,
  title: "Getting started",
  wordCount: 150,
  ...overrides,
})

/**
 * サイトのソースと、PATH の取得文書を入れる
 */
const insertWebsiteDocument = async () => {
  const source = await insertPassageSource(buildWebsiteSourceValues())
  const document = await insertPassageDocument(source.id, PATH)
  return { document, source }
}

const findPassageRows = async () => testDb.select().from(passages).orderBy(asc(passages.id))

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("UrlImportRepository", () => {
  describe("正常系", () => {
    it("upsertFetchedDocument は文書が無ければ作り、同じ (source_id, path) の 2 回目は同じ行の取得の結果を更新する", async () => {
      const source = await insertPassageSource(buildWebsiteSourceValues())

      const first = await transactionRunner.run(async (tx) => urlImportRepository.upsertFetchedDocument(buildDocumentInput(source.id), tx))
      await testDb.update(sourceDocuments).set({ blobSha: "blob", commitSha: "commit" }).where(eq(sourceDocuments.id, first.id))
      const refetchedAt = new Date("2026-10-21T03:00:00.000Z")
      const second = await transactionRunner.run(async (tx) => urlImportRepository.upsertFetchedDocument(buildDocumentInput(source.id, {
        contentHash: "hash-page-2",
        extractionVersion: "2026-10-19",
        fetchedAt: refetchedAt,
        title: "Tutorial: Get started with Go (updated)",
      }), tx))

      expect(second.id).toBe(first.id)
      const rows = await testDb.select().from(sourceDocuments).where(eq(sourceDocuments.sourceId, source.id))
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        blobSha: null,
        commitSha: null,
        contentHash: "hash-page-2",
        extractionVersion: "2026-10-19",
        fetchedAt: refetchedAt,
        path: PATH,
        title: "Tutorial: Get started with Go (updated)",
        updatedAt: refetchedAt,
      })
    })

    it("findDocumentPassages は (source_id, path) の文書の本文候補だけを返し、文書が無ければ空", async () => {
      const { document, source } = await insertWebsiteDocument()
      const otherDocument = await insertPassageDocument(source.id, "/doc/other")
      const passage = await insertPassage(document.id, { contentHash: "hash-a", status: "draft", title: "A" })
      await insertPassage(otherDocument.id, { contentHash: "hash-b", title: "B" })

      const found = await urlImportRepository.findDocumentPassages({ path: PATH, sourceId: source.id })
      const missing = await urlImportRepository.findDocumentPassages({ path: "/doc/missing", sourceId: source.id })

      expect(found).toEqual([{ id: passage.id, contentHash: "hash-a", generatedAt: passage.generatedAt, status: "draft", title: "A" }])
      expect(missing).toEqual([])
    })

    it("findPassagesByContentHashes は別の文書の行も返し、空の配列なら空を返す", async () => {
      const { document, source } = await insertWebsiteDocument()
      const otherDocument = await insertPassageDocument(source.id, "/doc/other/")
      const passage = await insertPassage(otherDocument.id, { contentHash: "hash-a", generatedAt: null, status: "collected", title: "A" })
      await insertPassage(document.id, { contentHash: "hash-b", title: "B" })

      const found = await urlImportRepository.findPassagesByContentHashes(["hash-a", "hash-missing"])
      const empty = await urlImportRepository.findPassagesByContentHashes([])

      expect(found).toEqual([{ id: passage.id, contentHash: "hash-a", generatedAt: null, status: "collected", title: "A" }])
      expect(empty).toEqual([])
    })

    it("insertCandidates は collected で挿入し、同じ content_hash の行は飛ばして、挿入した id だけを返す", async () => {
      const { document } = await insertWebsiteDocument()
      const existing = await insertPassage(document.id, { contentHash: "hash-existing", status: "published" })

      const ids = await transactionRunner.run(async (tx) => urlImportRepository.insertCandidates([
        buildCandidateInput(document.id, { contentHash: "hash-existing", title: "Existing" }),
        buildCandidateInput(document.id, { contentHash: "hash-new", title: "New" }),
      ], tx))

      const rows = await findPassageRows()
      expect(rows).toHaveLength(2)
      expect(ids).toEqual([rows[1].id])
      expect(rows[0]).toMatchObject({ id: existing.id, status: "published" })
      expect(rows[1]).toMatchObject({
        blocks: PASSAGE_BLOCKS,
        contentHash: "hash-new",
        generatedAt: null,
        generationPrioritizedAt: PRIORITIZED_AT,
        sourceCommitSha: null,
        sourceDocumentId: document.id,
        sourcePath: PATH,
        sourceRetrievedAt: FETCHED_AT,
        status: "collected",
        title: "New",
        wordCount: 150,
      })
    })

    it("insertCandidates は空の配列なら何もしない", async () => {
      const ids = await transactionRunner.run(async (tx) => urlImportRepository.insertCandidates([], tx))

      expect(ids).toEqual([])
    })

    it("prioritizeCollected は collected だけに時刻を入れ（別の文書のものも）、すでに入っていれば変えない", async () => {
      const { document, source } = await insertWebsiteDocument()
      const otherDocument = await insertPassageDocument(source.id, "/doc/other/")
      const target = await insertPassage(otherDocument.id, { contentHash: "hash-a", generatedAt: null, status: "collected", title: "A" })
      const alreadyPrioritized = await insertPassage(document.id, {
        contentHash: "hash-b",
        generatedAt: null,
        generationPrioritizedAt: EARLIER_PRIORITIZED_AT,
        status: "collected",
        title: "B",
      })
      const drafted = await insertPassage(document.id, { contentHash: "hash-c", status: "draft", title: "C" })
      const notListed = await insertPassage(document.id, { contentHash: "hash-d", generatedAt: null, status: "collected", title: "D" })

      const prioritized = await transactionRunner.run(async (tx) =>
        urlImportRepository.prioritizeCollected({ contentHashes: ["hash-a", "hash-b", "hash-c"], now: PRIORITIZED_AT }, tx))

      expect([...prioritized].sort((left, right) => left.id - right.id)).toEqual([
        { id: target.id, contentHash: "hash-a", title: "A" },
        { id: alreadyPrioritized.id, contentHash: "hash-b", title: "B" },
      ])
      const rows = await findPassageRows()
      expect(rows.map((row) => [row.id, row.generationPrioritizedAt])).toEqual([
        [target.id, PRIORITIZED_AT],
        [alreadyPrioritized.id, EARLIER_PRIORITIZED_AT],
        [drafted.id, null],
        [notListed.id, null],
      ])
    })

    it("prioritizeCollected は空の配列なら何もしない", async () => {
      const { document } = await insertWebsiteDocument()
      await insertPassage(document.id, { contentHash: "hash-a", generatedAt: null, status: "collected" })

      const prioritized = await transactionRunner.run(async (tx) =>
        urlImportRepository.prioritizeCollected({ contentHashes: [], now: PRIORITIZED_AT }, tx))

      expect(prioritized).toEqual([])
      const rows = await findPassageRows()
      expect(rows[0].generationPrioritizedAt).toBeNull()
    })

    it("rejectCollected はその文書の collected のうち、残すハッシュに無いものだけを却下する", async () => {
      const { document, source } = await insertWebsiteDocument()
      const otherDocument = await insertPassageDocument(source.id, "/doc/other/")
      const kept = await insertPassage(document.id, { contentHash: "hash-keep", generatedAt: null, status: "collected" })
      const superseded = await insertPassage(document.id, { contentHash: "hash-old", generatedAt: null, status: "collected" })
      const drafted = await insertPassage(document.id, { contentHash: "hash-draft", status: "draft" })
      const otherDocumentPassage = await insertPassage(otherDocument.id, { contentHash: "hash-other", generatedAt: null, status: "collected" })

      const rejectedCount = await transactionRunner.run(async (tx) => urlImportRepository.rejectCollected({
        keepContentHashes: ["hash-keep"],
        reason: "superseded",
        sourceDocumentId: document.id,
      }, tx))

      expect(rejectedCount).toBe(1)
      const rows = await findPassageRows()
      expect(rows.map((row) => [row.id, row.status, row.rejectReason])).toEqual([
        [kept.id, "collected", null],
        [superseded.id, "rejected", "superseded"],
        [drafted.id, "draft", null],
        [otherDocumentPassage.id, "collected", null],
      ])
    })

    it("rejectCollected は残すハッシュが空なら、その文書の collected をすべて却下する", async () => {
      const { document } = await insertWebsiteDocument()
      await insertPassage(document.id, { contentHash: "hash-a", generatedAt: null, status: "collected" })
      await insertPassage(document.id, { contentHash: "hash-b", generatedAt: null, status: "collected" })

      const rejectedCount = await transactionRunner.run(async (tx) => urlImportRepository.rejectCollected({
        keepContentHashes: [],
        reason: "superseded",
        sourceDocumentId: document.id,
      }, tx))

      expect(rejectedCount).toBe(2)
      const rows = await findPassageRows()
      expect(rows.map((row) => row.status)).toEqual(["rejected", "rejected"])
    })
  })

  describe("異常系", () => {
    it("トランザクションの中で失敗したら、文書の upsert も挿入も残らない", async () => {
      const source = await insertPassageSource(buildWebsiteSourceValues())

      await expect(transactionRunner.run(async (tx) => {
        const document = await urlImportRepository.upsertFetchedDocument(buildDocumentInput(source.id), tx)
        await urlImportRepository.insertCandidates([buildCandidateInput(document.id)], tx)
        throw new Error("rollback")
      })).rejects.toThrow()

      expect(await testDb.select().from(sourceDocuments).where(eq(sourceDocuments.sourceId, source.id))).toEqual([])
      expect(await findPassageRows()).toEqual([])
    })
  })
})
