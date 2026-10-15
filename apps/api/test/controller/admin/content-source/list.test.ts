import request from "supertest"

import { AdminContentSourceListController } from "../../../../src/controller/admin/content-source/list"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzleContentSourceRepository } from "../../../../src/repository/drizzle/content-source-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { insertSourceTags } from "../../../fixture/source-tag"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { insertGitHubSource, insertPassages, insertSourceDocument, insertWebsiteSource } from "./fixtures"

const contentSourceRepository = new DrizzleContentSourceRepository(testDb)

const app = createTestApp()

app.use("/api/admin", adminRouter({
  contentSource: { list: new AdminContentSourceListController(contentSourceRepository) },
}))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/content-source", () => {
  describe("正常系", () => {
    it("200 とソースごとのタグ（名前の順）・状態別の件数・取得失敗の件数を id の昇順で返す", async () => {
      const github = await insertGitHubSource({ lastCollectedAt: new Date("2026-10-09T03:00:00.000Z") })
      const website = await insertWebsiteSource()
      const [react, frontend] = await insertSourceTags(github.id, ["react", "Frontend"])
      const document = await insertSourceDocument(github.id, "src/content/learn/a.md")
      await insertPassages(document.id, "collected", 2)
      await insertPassages(document.id, "published", 1)
      await insertSourceDocument(website.id, "/doc/a", 404)
      await insertSourceDocument(website.id, "/doc/b", 500)
      await insertSourceDocument(website.id, "/doc/c", 304)

      const res = await request(app)
        .get("/api/admin/content-source")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        sources: [
          {
            id: github.id,
            failed_page_count: 0,
            fetch_type: "github_repository",
            is_enabled: true,
            kind: "docs",
            last_collected_at: "2026-10-09T03:00:00.000Z",
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
            failed_page_count: 2,
            fetch_type: "website",
            is_enabled: false,
            kind: "docs",
            last_collected_at: null,
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

    it("ソースが無ければ空配列を返す", async () => {
      const res = await request(app)
        .get("/api/admin/content-source")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ sources: [] })
    })
  })

  describe("異常系", () => {
    it("X-Admin-Token が無ければ 401 を返す", async () => {
      await insertGitHubSource()

      const res = await request(app).get("/api/admin/content-source")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
