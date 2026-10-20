import request from "supertest"

import { sourceDocuments } from "@repo/db"

import type { IPageFetcher } from "../../../../src/client/page-fetcher"
import { AdminUrlImportPreviewController } from "../../../../src/controller/admin/url-import/preview"
import { DrizzleContentSourceRepository } from "../../../../src/repository/drizzle/content-source-repository"
import { DrizzleUrlImportRepository } from "../../../../src/repository/drizzle/url-import-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { insertPassage } from "../../../fixture/passage"
import { buildChunk, buildFetchedPage } from "../../../fixture/url-import"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"
import { insertSourceDocument, insertWebsiteSource } from "../content-source/fixtures"

/**
 * サイトの取得だけを fake にする
 */
const mockFetchAndExtractPage = vi.fn<IPageFetcher["fetchAndExtractPage"]>()
const fakePageFetcher: IPageFetcher = { fetchAndExtractPage: mockFetchAndExtractPage }

const PAGE_URL = "https://go.dev/doc/tutorial/getting-started"

const app = createTestApp()
mountAdminApi(app, adminRouter({
  urlImport: {
    preview: new AdminUrlImportPreviewController(
      new DrizzleContentSourceRepository(testDb),
      new DrizzleUrlImportRepository(testDb),
      fakePageFetcher,
    ),
  },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
  vi.clearAllMocks()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/url-import/preview", () => {
  describe("正常系", () => {
    it("200 で、当たったソース・ページ・塊ごとの結果を返し、DB に書かない", async () => {
      const source = await insertWebsiteSource()
      const document = await insertSourceDocument(source.id, "/doc/tutorial/getting-started")
      await insertPassage(document.id, { contentHash: "hash-collected", generatedAt: null, status: "collected", title: "Collected" })
      mockFetchAndExtractPage.mockResolvedValue({
        kind: "ok",
        page: buildFetchedPage({
          chunks: [
            buildChunk({ contentHash: "hash-new", title: "New" }),
            buildChunk({ contentHash: "hash-collected", title: "Collected" }),
            buildChunk({ blocks: [{ text: "Short", type: "heading" }], contentHash: "hash-short", rejectReasons: ["too_short"], title: "Short", wordCount: 3 }),
          ],
        }),
      })

      const res = await request(app)
        .post("/api/admin/url-import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ url: ` ${PAGE_URL}?lang=en ` })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        chunks: [
          {
            excerpt: "In this tutorial, you'll get a brief introduction to Go programming.",
            reject_reasons: [],
            status: "new",
            title: "New",
            word_count: 150,
          },
          {
            excerpt: "In this tutorial, you'll get a brief introduction to Go programming.",
            reject_reasons: [],
            status: "existing",
            title: "Collected",
            word_count: 150,
          },
          { excerpt: "", reject_reasons: ["too_short"], status: "not_candidate", title: "Short", word_count: 3 },
        ],
        page: { path: "/doc/tutorial/getting-started", title: "Tutorial: Get started with Go", url: PAGE_URL, word_count: 900 },
        source: { id: source.id, license_spdx: "CC-BY-4.0", name: "Go 公式ドキュメント" },
      })
      expect(mockFetchAndExtractPage).toHaveBeenCalledWith({
        now: expect.any(Date),
        source: expect.objectContaining({ id: source.id, siteUrl: "https://go.dev" }),
        url: `${PAGE_URL}?lang=en`,
      })
      expect(await testDb.$count(sourceDocuments)).toBe(1)
    })
  })

  describe("異常系", () => {
    it("取り込めなければ 400 と理由の code を details で返す", async () => {
      await insertWebsiteSource()
      mockFetchAndExtractPage.mockResolvedValue({ code: "out_of_target_path", detail: null, kind: "failed" })

      const res = await request(app)
        .post("/api/admin/url-import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ url: "https://go.dev/blog/" })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({
        details: [{ code: "out_of_target_path", message: expect.any(String), path: ["url"] }],
        error: expect.any(String),
        status_code: 400,
      })
    })

    it("ソースが無ければ 400（source_not_found）で、ページを取得しない", async () => {
      const res = await request(app)
        .post("/api/admin/url-import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ url: PAGE_URL })

      expect(res.status).toBe(400)
      expect(res.body.details).toEqual([{ code: "source_not_found", message: expect.any(String), path: ["url"] }])
      expect(mockFetchAndExtractPage).not.toHaveBeenCalled()
    })

    it.each([
      ["http", "http://go.dev/doc/"],
      ["URL でない", "go.dev/doc/"],
      ["空", ""],
    ])("URL が %s なら 400 を返し、ページを取得しない", async (_label, url) => {
      await insertWebsiteSource()

      const res = await request(app)
        .post("/api/admin/url-import/preview")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ url })

      expect(res.status).toBe(400)
      expect(mockFetchAndExtractPage).not.toHaveBeenCalled()
    })

    it("Authorization が無ければ 401 を返す", async () => {
      const res = await request(app).post("/api/admin/url-import/preview").send({ url: PAGE_URL })

      expect(res.status).toBe(401)
      expect(mockFetchAndExtractPage).not.toHaveBeenCalled()
    })
  })
})
