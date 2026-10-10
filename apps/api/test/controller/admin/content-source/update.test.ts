import request from "supertest"

import { contentSources, eq } from "@repo/db"

import { AdminContentSourceUpdateController } from "../../../../src/controller/admin/content-source/update"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzleContentSourceRepository } from "../../../../src/repository/drizzle/content-source-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { GITHUB_REQUEST, insertGitHubSource, insertWebsiteSource, WEBSITE_REQUEST } from "./fixtures"

const contentSourceRepository = new DrizzleContentSourceRepository(testDb)

const app = createTestApp()

app.use("/api/admin", adminRouter({
  contentSource: { update: new AdminContentSourceUpdateController(contentSourceRepository) },
}))
attachUnhandledExceptionHandler(app)

const selectSource = async (id: number) => {
  const [row] = await testDb.select().from(contentSources).where(eq(contentSources.id, id))
  return row
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("PUT /api/admin/content-source/:id", () => {
  describe("正常系", () => {
    it("website の内容と is_enabled を更新して 200 を返す", async () => {
      const website = await insertWebsiteSource()
      const body = {
        ...WEBSITE_REQUEST,
        content_selector: null,
        exclude_selectors: [],
        is_enabled: true,
        name: "Go Docs",
        sitemap_url: null,
        start_url: "https://go.dev/doc/",
        tags: ["go", "backend"],
      }

      const res = await request(app)
        .put(`/api/admin/content-source/${website.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send(body)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        ...body,
        id: website.id,
        last_collected_at: null,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      })
      expect(await selectSource(website.id)).toMatchObject({
        contentSelector: null,
        excludeSelectors: [],
        isEnabled: true,
        name: "Go Docs",
        sitemapUrl: null,
        startUrl: "https://go.dev/doc/",
        tags: ["go", "backend"],
      })
    })

    it("github の include_globs を変えると DB の last_collected_commit_sha が null になる", async () => {
      const github = await insertGitHubSource({ lastCollectedCommitSha: "abc123" })

      const res = await request(app)
        .put(`/api/admin/content-source/${github.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ ...GITHUB_REQUEST, include_globs: ["src/content/reference/**/*.md"] })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ include_globs: ["src/content/reference/**/*.md"], last_collected_commit_sha: null })
      expect(await selectSource(github.id)).toMatchObject({
        includeGlobs: ["src/content/reference/**/*.md"],
        lastCollectedCommitSha: null,
      })
    })

    it("github の name と is_enabled だけを変えると last_collected_commit_sha は残る", async () => {
      const github = await insertGitHubSource({ lastCollectedCommitSha: "abc123" })

      const res = await request(app)
        .put(`/api/admin/content-source/${github.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ ...GITHUB_REQUEST, is_enabled: false, name: "React Docs" })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ is_enabled: false, last_collected_commit_sha: "abc123", name: "React Docs" })
      expect(await selectSource(github.id)).toMatchObject({
        isEnabled: false,
        lastCollectedCommitSha: "abc123",
        name: "React Docs",
      })
    })
  })

  describe("異常系", () => {
    it("fetch_type を変えると 400 を返し、DB は変わらない", async () => {
      const github = await insertGitHubSource()

      const res = await request(app)
        .put(`/api/admin/content-source/${github.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ ...WEBSITE_REQUEST, is_enabled: true })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(await selectSource(github.id)).toMatchObject({ fetchType: "github_repository", siteUrl: null })
    })

    it("website で is_enabled が無ければ 400 を返す", async () => {
      const website = await insertWebsiteSource()

      const res = await request(app)
        .put(`/api/admin/content-source/${website.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send(WEBSITE_REQUEST)

      expect(res.status).toBe(400)
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .put("/api/admin/content-source/999999")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send(GITHUB_REQUEST)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it(":id が数値でなければ 400 を返す", async () => {
      const res = await request(app)
        .put("/api/admin/content-source/abc")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send(GITHUB_REQUEST)

      expect(res.status).toBe(400)
    })

    it("別のソースの repository に変えると 409 を返し、DB は変わらない", async () => {
      await insertGitHubSource({ repository: "vercel/next.js" })
      const github = await insertGitHubSource()

      const res = await request(app)
        .put(`/api/admin/content-source/${github.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ ...GITHUB_REQUEST, repository: "vercel/next.js" })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await selectSource(github.id)).toMatchObject({ repository: "reactjs/react.dev" })
    })

    it("X-Admin-Token が無ければ 401 を返し、DB は変わらない", async () => {
      const github = await insertGitHubSource()

      const res = await request(app)
        .put(`/api/admin/content-source/${github.id}`)
        .send({ ...GITHUB_REQUEST, name: "React Docs" })

      expect(res.status).toBe(401)
      expect(await selectSource(github.id)).toMatchObject({ name: "React 公式ドキュメント" })
    })
  })
})
