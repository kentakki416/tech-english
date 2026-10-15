import request from "supertest"

import { asc, contentSources, contentSourceTags, eq, sourceDocuments } from "@repo/db"

import { AdminContentSourceUpdateController } from "../../../../src/controller/admin/content-source/update"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzleContentSourceRepository } from "../../../../src/repository/drizzle/content-source-repository"
import { DrizzleTagRepository } from "../../../../src/repository/drizzle/tag-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { insertSourceTags, insertTags } from "../../../fixture/source-tag"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import {
  GITHUB_REQUEST,
  insertGitHubSource,
  insertSourceDocument,
  insertWebsiteSource,
  omitTagIds,
  WEBSITE_REQUEST,
} from "./fixtures"

const contentSourceRepository = new DrizzleContentSourceRepository(testDb)
const tagRepository = new DrizzleTagRepository(testDb)

const app = createTestApp()

app.use("/api/admin", adminRouter({
  contentSource: { update: new AdminContentSourceUpdateController(contentSourceRepository, tagRepository) },
}))
attachUnhandledExceptionHandler(app)

const selectSource = async (id: number) => {
  const [row] = await testDb.select().from(contentSources).where(eq(contentSources.id, id))
  return row
}

/**
 * 取得済みのページ（ETag / Last-Modified / 本文のハッシュつき）を入れる
 */
const insertFetchedDocument = async (sourceId: number, path: string) => {
  const [row] = await testDb.insert(sourceDocuments).values({
    contentHash: "content-hash",
    etag: "\"v1\"",
    fetchedAt: new Date("2026-10-10T03:00:00.000Z"),
    httpStatus: 200,
    lastModified: "Sat, 10 Oct 2026 00:00:00 GMT",
    path,
    sourceId,
  }).returning()
  return row
}

const selectSourceTagIds = async (sourceId: number): Promise<number[]> => {
  const rows = await testDb
    .select({ tagId: contentSourceTags.tagId })
    .from(contentSourceTags)
    .where(eq(contentSourceTags.contentSourceId, sourceId))
    .orderBy(asc(contentSourceTags.tagId))
  return rows.map((row) => row.tagId)
}

const selectSourceDocument = async (id: number) => {
  const [row] = await testDb.select().from(sourceDocuments).where(eq(sourceDocuments.id, id))
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
    it("website の内容と is_enabled とタグを更新して 200 を返す", async () => {
      const website = await insertWebsiteSource()
      const [go, backend] = await insertTags(["go", "backend"])
      const body = {
        ...WEBSITE_REQUEST,
        content_selector: null,
        exclude_selectors: [],
        is_enabled: true,
        name: "Go Docs",
        sitemap_url: null,
        start_url: "https://go.dev/doc/",
        tag_ids: [go.id, backend.id],
      }

      const res = await request(app)
        .put(`/api/admin/content-source/${website.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send(body)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        ...omitTagIds(body),
        id: website.id,
        last_collected_at: null,
        tags: [
          { id: backend.id, color: backend.color, name: "backend" },
          { id: go.id, color: go.color, name: "go" },
        ],
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
      })
      expect(await selectSourceTagIds(website.id)).toEqual([go.id, backend.id])
    })

    it("tag_ids を変えると 200 で、レスポンスと content_source_tags が新しいタグになる（ほかのソースのタグは変わらない）", async () => {
      const github = await insertGitHubSource()
      const other = await insertWebsiteSource()
      const [react, frontend] = await insertSourceTags(github.id, ["react", "frontend"])
      await insertSourceTags(other.id, ["react", "frontend"])
      const [hooks] = await insertTags(["Hooks"])

      const res = await request(app)
        .put(`/api/admin/content-source/${github.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ ...GITHUB_REQUEST, tag_ids: [react.id, hooks.id] })

      expect(res.status).toBe(200)
      expect(res.body.tags).toEqual([
        { id: hooks.id, color: hooks.color, name: "Hooks" },
        { id: react.id, color: react.color, name: "react" },
      ])
      expect(await selectSourceTagIds(github.id)).toEqual([react.id, hooks.id])
      expect(await selectSourceTagIds(other.id)).toEqual([react.id, frontend.id])
    })

    it("tag_ids: [] で送るとソースのタグが全部外れる", async () => {
      const github = await insertGitHubSource()
      await insertSourceTags(github.id, ["react", "frontend"])

      const res = await request(app)
        .put(`/api/admin/content-source/${github.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ ...GITHUB_REQUEST, tag_ids: [] })

      expect(res.status).toBe(200)
      expect(res.body.tags).toEqual([])
      expect(await selectSourceTagIds(github.id)).toEqual([])
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

    it("website の content_selector を変えると、そのソースの source_documents の etag / last_modified / content_hash が null になる", async () => {
      const website = await insertWebsiteSource()
      const document = await insertFetchedDocument(website.id, "/doc/a")

      const res = await request(app)
        .put(`/api/admin/content-source/${website.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ ...WEBSITE_REQUEST, content_selector: "main", is_enabled: true })

      expect(res.status).toBe(200)
      expect(await selectSourceDocument(document.id)).toMatchObject({
        contentHash: null,
        etag: null,
        fetchedAt: new Date("2026-10-10T03:00:00.000Z"),
        lastModified: null,
      })
    })

    it("website の name だけを変えると source_documents は変わらない", async () => {
      const website = await insertWebsiteSource()
      const document = await insertFetchedDocument(website.id, "/doc/a")

      const res = await request(app)
        .put(`/api/admin/content-source/${website.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ ...WEBSITE_REQUEST, is_enabled: true, name: "Go Docs" })

      expect(res.status).toBe(200)
      expect(await selectSourceDocument(document.id)).toMatchObject({
        contentHash: "content-hash",
        etag: "\"v1\"",
        lastModified: "Sat, 10 Oct 2026 00:00:00 GMT",
      })
    })

    it("取得した文書があるソースでも license は変えられる", async () => {
      const github = await insertGitHubSource()
      await insertSourceDocument(github.id, "src/content/learn/a.md")

      const res = await request(app)
        .put(`/api/admin/content-source/${github.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ ...GITHUB_REQUEST, license_spdx: "MIT", license_url: "https://github.com/reactjs/react.dev/blob/main/LICENSE" })

      expect(res.status).toBe(200)
      expect(await selectSource(github.id)).toMatchObject({ licenseSpdx: "MIT", repository: "reactjs/react.dev" })
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

    it("存在しない tag の id なら 400 と tag_ids の details を返し、ソースもタグも変わらない", async () => {
      const github = await insertGitHubSource()
      const [react] = await insertSourceTags(github.id, ["react"])
      const before = await selectSource(github.id)

      const res = await request(app)
        .put(`/api/admin/content-source/${github.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ ...GITHUB_REQUEST, name: "React Docs", tag_ids: [react.id + 1000] })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({
        details: [{ code: "tag_not_found", message: expect.any(String), path: ["tag_ids"] }],
        error: expect.any(String),
        status_code: 400,
      })
      expect(await selectSource(github.id)).toEqual(before)
      expect(await selectSourceTagIds(github.id)).toEqual([react.id])
    })

    it.each([
      ["tag_ids に重複がある", { ...GITHUB_REQUEST, tag_ids: [1, 1] }],
      ["tag_ids が 11 個", { ...GITHUB_REQUEST, tag_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
      ["tag_ids が無い（古い形の tags だけ）", { ...omitTagIds(GITHUB_REQUEST), tags: ["react"] }],
    ])("%sなら 400 を返し、タグは変わらない", async (_label, body) => {
      const github = await insertGitHubSource()
      const [react] = await insertSourceTags(github.id, ["react"])

      const res = await request(app)
        .put(`/api/admin/content-source/${github.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send(body)

      expect(res.status).toBe(400)
      expect(await selectSourceTagIds(github.id)).toEqual([react.id])
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

    it.each([
      ["github の repository", async () => {
        const github = await insertGitHubSource()
        await insertSourceDocument(github.id, "src/content/learn/a.md")
        return { body: { ...GITHUB_REQUEST, repository: "reactjs/react.dev-fork" }, id: github.id }
      }],
      ["website の site_url", async () => {
        const website = await insertWebsiteSource()
        await insertSourceDocument(website.id, "/doc/a")
        return {
          body: { ...WEBSITE_REQUEST, is_enabled: true, site_url: "https://go.example.dev", sitemap_url: "https://go.example.dev/sitemap.xml" },
          id: website.id,
        }
      }],
    ])("取得した文書があるソースの %s を変えると 400（details なし。admin がタグの 400 と見分ける）を返し、DB は変わらない", async (_label, arrange) => {
      const { body, id } = await arrange()
      const before = await selectSource(id)

      const res = await request(app)
        .put(`/api/admin/content-source/${id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(await selectSource(id)).toEqual(before)
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
