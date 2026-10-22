import request from "supertest"

import { asc, passages, sourceDocuments } from "@repo/db"

import type { IPageFetcher } from "../../../../src/client/page-fetcher"
import { AdminUrlImportCreateController } from "../../../../src/controller/admin/url-import/create"
import { DrizzleSourceRepository } from "../../../../src/repository/drizzle/source-repository"
import { DrizzleTransactionRunner } from "../../../../src/repository/drizzle/transaction-runner"
import { DrizzleUrlImportRepository } from "../../../../src/repository/drizzle/url-import-repository"
import { IoRedisUrlImportPageCacheRepository } from "../../../../src/repository/redis/url-import-page-cache-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { insertPassage } from "../../../fixture/passage"
import { buildChunk, buildFetchedPage } from "../../../fixture/url-import"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, cleanupTestRedis, disconnectTestDb, disconnectTestRedis, testDb, testRedis } from "../../setup"
import { insertSourceDocument, insertWebsiteSource } from "../source/fixtures"

/**
 * サイトの取得だけを fake にする
 */
const mockFetchAndExtractPage = vi.fn<IPageFetcher["fetchAndExtractPage"]>()
const fakePageFetcher: IPageFetcher = { fetchAndExtractPage: mockFetchAndExtractPage }

const PAGE_URL = "https://go.dev/doc/tutorial/getting-started"
const PATH = "/doc/tutorial/getting-started"

const app = createTestApp()
mountAdminApi(app, adminRouter({
  urlImport: {
    create: new AdminUrlImportCreateController(
      new DrizzleSourceRepository(testDb),
      new DrizzleUrlImportRepository(testDb),
      new IoRedisUrlImportPageCacheRepository(testRedis),
      new DrizzleTransactionRunner(testDb),
      fakePageFetcher,
    ),
  },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  adminToken = (await createTestAdmin()).token
  vi.clearAllMocks()
})

afterAll(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

const findPassageRows = async () => testDb.select().from(passages).orderBy(asc(passages.id))

describe("POST /api/admin/url-import", () => {
  describe("正常系", () => {
    it("201 で、作った件数・優先した本文候補を返し、文書と生成を優先した collected を保存して前の切り分けを却下する", async () => {
      const source = await insertWebsiteSource()
      const document = await insertSourceDocument(source.id, PATH)
      const existing = await insertPassage(document.id, { contentHash: "hash-existing", generatedAt: null, status: "collected", title: "Existing" })
      const superseded = await insertPassage(document.id, { contentHash: "hash-old", generatedAt: null, status: "collected", title: "Old" })
      mockFetchAndExtractPage.mockResolvedValue({
        kind: "ok",
        page: buildFetchedPage({
          chunks: [
            buildChunk({ contentHash: "hash-new", title: "New" }),
            buildChunk({ contentHash: "hash-existing", title: "Existing" }),
          ],
        }),
      })

      const res = await request(app)
        .post("/api/admin/url-import")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ url: PAGE_URL })

      expect(res.status).toBe(201)
      const rows = await findPassageRows()
      const created = rows.find((row) => row.contentHash === "hash-new")
      expect(res.body).toEqual({
        created_count: 1,
        passages: [
          { id: created?.id, is_new: true, title: "New" },
          { id: existing.id, is_new: false, title: "Existing" },
        ],
        rejected_count: 1,
        source_document_id: document.id,
        source_id: source.id,
      })
      expect(rows).toHaveLength(3)
      expect(rows.find((row) => row.id === existing.id)).toMatchObject({ generationPrioritizedAt: expect.any(Date), status: "collected" })
      expect(rows.find((row) => row.id === superseded.id)).toMatchObject({ generationPrioritizedAt: null, status: "rejected" })
      expect(created).toMatchObject({
        generationPrioritizedAt: expect.any(Date),
        sourceDocumentId: document.id,
        sourcePath: PATH,
        status: "collected",
      })
      const [savedDocument] = await testDb.select().from(sourceDocuments)
      expect(savedDocument).toMatchObject({
        contentHash: "hash-page",
        extractionVersion: "2026-10-18",
        fetchedAt: expect.any(Date),
        path: PATH,
        title: "Tutorial: Get started with Go",
      })
    })

    it("同じ URL を 2 回保存すると、2 回目は作った件数が 0 で、同じ本文候補を優先したまま返す", async () => {
      await insertWebsiteSource()
      mockFetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })
      const send = async () => request(app).post("/api/admin/url-import").set("Authorization", `Bearer ${adminToken}`).send({ url: PAGE_URL })

      const first = await send()
      const prioritizedAt = (await findPassageRows())[0].generationPrioritizedAt
      const second = await send()

      expect(first.body.created_count).toBe(1)
      expect(second.status).toBe(201)
      expect(second.body).toMatchObject({ created_count: 0, passages: [{ id: first.body.passages[0].id, is_new: false }], rejected_count: 0 })
      const rows = await findPassageRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].generationPrioritizedAt).toEqual(prioritizedAt)
      expect(await testDb.$count(sourceDocuments)).toBe(1)
    })
  })

  describe("異常系", () => {
    it("取り込めなければ 400 と理由の code を返し、DB に書かない", async () => {
      await insertWebsiteSource()
      mockFetchAndExtractPage.mockResolvedValue({ code: "http_error", detail: "404", kind: "failed" })

      const res = await request(app)
        .post("/api/admin/url-import")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ url: PAGE_URL })

      expect(res.status).toBe(400)
      expect(res.body.details).toEqual([{ code: "http_error", message: expect.any(String), path: ["url"] }])
      expect(await testDb.$count(sourceDocuments)).toBe(0)
      expect(await testDb.$count(passages)).toBe(0)
    })

    it("http の URL は 400 を返し、ページを取得しない", async () => {
      await insertWebsiteSource()

      const res = await request(app)
        .post("/api/admin/url-import")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ url: "http://go.dev/doc/" })

      expect(res.status).toBe(400)
      expect(mockFetchAndExtractPage).not.toHaveBeenCalled()
    })

    it("Authorization が無ければ 401 を返し、DB に書かない", async () => {
      await insertWebsiteSource()
      mockFetchAndExtractPage.mockResolvedValue({ kind: "ok", page: buildFetchedPage() })

      const res = await request(app).post("/api/admin/url-import").send({ url: PAGE_URL })

      expect(res.status).toBe(401)
      expect(mockFetchAndExtractPage).not.toHaveBeenCalled()
      expect(await testDb.$count(passages)).toBe(0)
    })
  })
})
