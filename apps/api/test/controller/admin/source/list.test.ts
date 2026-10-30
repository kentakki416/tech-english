import request from "supertest"

import { AdminSourceListController } from "../../../../src/controller/admin/source/list"
import { DrizzleSourceCollectionRunRepository } from "../../../../src/repository/drizzle/source-collection-run-repository"
import { DrizzleSourceRepository } from "../../../../src/repository/drizzle/source-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { insertSourceCollectionRun } from "../../../fixture/source-collection-run"
import { insertSourceTags } from "../../../fixture/source-tag"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { insertGitHubSource, insertPassages, insertSourceDocument, insertWebsiteSource } from "./fixtures"

const sourceRepository = new DrizzleSourceRepository(testDb)
const sourceCollectionRunRepository = new DrizzleSourceCollectionRunRepository(testDb)

const app = createTestApp()

mountAdminApi(app, adminRouter({
  source: { list: new AdminSourceListController(sourceRepository, sourceCollectionRunRepository) },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/source", () => {
  describe("正常系", () => {
    it("200 とソースごとのタグ（名前の順）・状態別の件数を id の昇順で返す", async () => {
      const github = await insertGitHubSource({ lastCollectedAt: new Date("2026-10-09T03:00:00.000Z") })
      const website = await insertWebsiteSource()
      const [react, frontend] = await insertSourceTags(github.id, ["react", "Frontend"])
      const document = await insertSourceDocument(github.id, "src/content/learn/a.md")
      await insertPassages(document.id, "collected", 2)
      await insertPassages(document.id, "published", 1)

      const res = await request(app)
        .get("/api/admin/source")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        sources: [
          {
            id: github.id,
            fetch_type: "github_repository",
            is_enabled: true,
            kind: "docs",
            last_collected_at: "2026-10-09T03:00:00.000Z",
            latest_collection_run: null,
            license_spdx: "CC-BY-4.0",
            name: "React 公式ドキュメント",
            passage_counts: { collected: 2, draft: 0, failed: 0, generating: 0, published: 1, rejected: 0 },
            repository: "reactjs/react.dev",
            site_url: null,
            tags: [
              { id: frontend.id, color: frontend.color, name: "Frontend" },
              { id: react.id, color: react.color, name: "react" },
            ],
          },
          {
            id: website.id,
            fetch_type: "website",
            is_enabled: false,
            kind: "docs",
            last_collected_at: null,
            latest_collection_run: null,
            license_spdx: "CC-BY-4.0",
            name: "Go 公式ドキュメント",
            passage_counts: { collected: 0, draft: 0, failed: 0, generating: 0, published: 0, rejected: 0 },
            repository: null,
            site_url: "https://go.dev",
            tags: [],
          },
        ],
      })
    })

    it("最後の収集の記録をソースごとに返す", async () => {
      const github = await insertGitHubSource()
      await insertGitHubSource({ repository: "example/other" })
      await insertSourceCollectionRun({ sourceId: github.id, status: "completed" })
      const latest = await insertSourceCollectionRun({ createdPassageCount: 215, fetchedDocumentCount: 51, sourceId: github.id, status: "limit_reached" })

      const res = await request(app)
        .get("/api/admin/source")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.sources.map((source: { latest_collection_run: unknown }) => source.latest_collection_run)).toEqual([
        {
          id: latest.id,
          created_at: expect.any(String),
          created_passage_count: 215,
          error: null,
          fetched_document_count: 51,
          finished_at: expect.any(String),
          started_at: expect.any(String),
          status: "limit_reached",
        },
        null,
      ])
    })

    it("30 分を過ぎた収集中の記録を failed にして返し、別のソースの新しい記録は変えない", async () => {
      const stale = await insertGitHubSource()
      const fresh = await insertGitHubSource({ repository: "example/other" })
      await insertSourceCollectionRun({ createdAt: new Date(Date.now() - 31 * 60_000), sourceId: stale.id, status: "queued" })
      await insertSourceCollectionRun({ sourceId: fresh.id, status: "queued" })

      const res = await request(app)
        .get("/api/admin/source")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.sources.map((source: { latest_collection_run: { status: string } }) => source.latest_collection_run.status)).toEqual(["failed", "queued"])
    })

    it("ソースが無ければ空配列を返す", async () => {
      const res = await request(app)
        .get("/api/admin/source")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ sources: [] })
    })
  })

  describe("異常系", () => {
    it("Authorization が無ければ 401 を返す", async () => {
      await insertGitHubSource()

      const res = await request(app).get("/api/admin/source")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
