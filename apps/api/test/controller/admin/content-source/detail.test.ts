import request from "supertest"

import { AdminContentSourceDetailController } from "../../../../src/controller/admin/content-source/detail"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzleContentSourceRepository } from "../../../../src/repository/drizzle/content-source-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { insertGitHubSource, insertPassages, insertSourceDocument, insertWebsiteSource } from "./fixtures"

const contentSourceRepository = new DrizzleContentSourceRepository(testDb)

const app = createTestApp()

app.use("/api/admin", adminRouter({
  contentSource: { detail: new AdminContentSourceDetailController(contentSourceRepository) },
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

describe("GET /api/admin/content-source/:id", () => {
  describe("正常系", () => {
    it("github のソースを github の形で返し、状態別の件数を付ける", async () => {
      const github = await insertGitHubSource({ lastCollectedCommitSha: "abc123" })
      const document = await insertSourceDocument(github.id, "src/content/learn/a.md")
      await insertPassages(document.id, "draft", 2)
      await insertPassages(document.id, "failed", 1)

      const res = await request(app)
        .get(`/api/admin/content-source/${github.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        failed_pages: [],
        passage_counts: { collected: 0, draft: 2, failed: 1, generating: 0, published: 0, rejected: 0 },
        source: {
          id: github.id,
          branch: "main",
          exclude_globs: ["src/content/blog/**"],
          fetch_type: "github_repository",
          include_globs: ["src/content/learn/**/*.md"],
          is_enabled: true,
          kind: "docs",
          last_collected_at: null,
          last_collected_commit_sha: "abc123",
          license_spdx: "CC-BY-4.0",
          license_url: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
          name: "React 公式ドキュメント",
          public_url_strip_prefix: "src/content/",
          public_url_template: "https://react.dev/{path}",
          repository: "reactjs/react.dev",
          tags: ["react"],
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
      })
    })

    it("website のソースを website の形で返し、failed_pages は path の昇順で 400 以上だけ", async () => {
      const website = await insertWebsiteSource()
      await insertSourceDocument(website.id, "/doc/c", 404)
      await insertSourceDocument(website.id, "/doc/a", 500)
      await insertSourceDocument(website.id, "/doc/b", 200)
      await insertSourceDocument(website.id, "/doc/d", 304)

      const res = await request(app)
        .get(`/api/admin/content-source/${website.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        failed_pages: [
          { http_status: 500, path: "/doc/a" },
          { http_status: 404, path: "/doc/c" },
        ],
        passage_counts: { collected: 0, draft: 0, failed: 0, generating: 0, published: 0, rejected: 0 },
        source: {
          id: website.id,
          content_selector: "main article",
          exclude_globs: ["/doc/devel/**"],
          exclude_selectors: [".feedback"],
          fetch_type: "website",
          include_globs: ["/doc/**"],
          is_enabled: false,
          kind: "docs",
          last_collected_at: null,
          license_spdx: "CC-BY-4.0",
          license_url: "https://go.dev/copyright",
          name: "Go 公式ドキュメント",
          sitemap_url: "https://go.dev/sitemap.xml",
          site_url: "https://go.dev",
          start_url: null,
          tags: ["go"],
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
      })
    })
  })

  describe("異常系", () => {
    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .get("/api/admin/content-source/999999")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it.each(["abc", "0", "-1", "1.5", "2147483648"])(":id が %s なら 400 を返す", async (id) => {
      const res = await request(app)
        .get(`/api/admin/content-source/${id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("X-Admin-Token が無ければ 401 を返す", async () => {
      const github = await insertGitHubSource()

      const res = await request(app).get(`/api/admin/content-source/${github.id}`)

      expect(res.status).toBe(401)
    })
  })
})
