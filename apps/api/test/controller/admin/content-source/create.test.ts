import request from "supertest"

import { contentSources, contentSourceTags, eq } from "@repo/db"

import { AdminContentSourceCreateController } from "../../../../src/controller/admin/content-source/create"
import { DrizzleContentSourceRepository } from "../../../../src/repository/drizzle/content-source-repository"
import { DrizzleTagRepository } from "../../../../src/repository/drizzle/tag-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { insertTags } from "../../../fixture/source-tag"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { GITHUB_REQUEST, insertGitHubSource, insertWebsiteSource, omitTagIds, WEBSITE_REQUEST } from "./fixtures"

const contentSourceRepository = new DrizzleContentSourceRepository(testDb)
const tagRepository = new DrizzleTagRepository(testDb)

const app = createTestApp()

mountAdminApi(app, adminRouter({
  contentSource: { create: new AdminContentSourceCreateController(contentSourceRepository, tagRepository) },
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

describe("POST /api/admin/content-source", () => {
  describe("正常系", () => {
    it("github は 201 と作成したソースを返し、DB に保存する", async () => {
      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(GITHUB_REQUEST)

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        ...omitTagIds(GITHUB_REQUEST),
        id: expect.any(Number),
        last_collected_at: null,
        last_collected_commit_sha: null,
        tags: [],
        created_at: expect.any(String),
        updated_at: expect.any(String),
      })

      const [row] = await testDb.select().from(contentSources).where(eq(contentSources.id, res.body.id))
      expect(row).toMatchObject({
        branch: "main",
        excludeGlobs: ["src/content/blog/**"],
        fetchType: "github_repository",
        includeGlobs: ["src/content/learn/**/*.md"],
        isEnabled: true,
        licenseSpdx: "CC-BY-4.0",
        publicUrlTemplate: "https://react.dev/{path}",
        repository: "reactjs/react.dev",
        siteUrl: null,
      })
      expect(await testDb.$count(contentSourceTags)).toBe(0)
    })

    it("tag_ids を渡すと 201 と tags（{ id, color, name } の名前の順）を返し、content_source_tags に入る", async () => {
      const [react, frontend] = await insertTags(["react", "Frontend"])

      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...GITHUB_REQUEST, tag_ids: [react.id, frontend.id] })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        ...omitTagIds(GITHUB_REQUEST),
        id: expect.any(Number),
        last_collected_at: null,
        last_collected_commit_sha: null,
        tags: [
          { id: frontend.id, color: frontend.color, name: "Frontend" },
          { id: react.id, color: react.color, name: "react" },
        ],
        created_at: expect.any(String),
        updated_at: expect.any(String),
      })
      const rows = await testDb.select().from(contentSourceTags).where(eq(contentSourceTags.contentSourceId, res.body.id))
      expect(rows.map((row) => row.tagId).sort((left, right) => left - right)).toEqual([react.id, frontend.id])
    })

    it("tag_ids は 10 個まで受け付ける（境界値）", async () => {
      const tenTags = await insertTags(["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"])

      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...GITHUB_REQUEST, tag_ids: tenTags.map((tag) => tag.id) })

      expect(res.status).toBe(201)
      expect(res.body.tags).toHaveLength(10)
      expect(await testDb.$count(contentSourceTags)).toBe(10)
    })

    it("website は is_enabled: true を送っても無効で作り、site_url をオリジンにそろえる", async () => {
      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...WEBSITE_REQUEST, is_enabled: true, site_url: "https://go.dev/doc/" })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        ...omitTagIds(WEBSITE_REQUEST),
        id: expect.any(Number),
        is_enabled: false,
        last_collected_at: null,
        site_url: "https://go.dev",
        tags: [],
        created_at: expect.any(String),
        updated_at: expect.any(String),
      })

      const [row] = await testDb.select().from(contentSources).where(eq(contentSources.id, res.body.id))
      expect(row).toMatchObject({
        fetchType: "website",
        isEnabled: false,
        repository: null,
        sitemapUrl: "https://go.dev/sitemap.xml",
        siteUrl: "https://go.dev",
      })
    })

    it("github の repository は小文字にそろえて保存する", async () => {
      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...GITHUB_REQUEST, repository: "ReactJS/React.dev" })

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ repository: "reactjs/react.dev" })
      const [row] = await testDb.select().from(contentSources).where(eq(contentSources.id, res.body.id))
      expect(row).toMatchObject({ repository: "reactjs/react.dev" })
    })

    it("website は start_url だけでも登録できる", async () => {
      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...WEBSITE_REQUEST, sitemap_url: null, start_url: "https://go.dev/doc/" })

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ sitemap_url: null, start_url: "https://go.dev/doc/" })
    })
  })

  describe("異常系", () => {
    it.each([
      ["github で repository が無い", { ...GITHUB_REQUEST, repository: undefined }],
      ["github で repository が owner だけ", { ...GITHUB_REQUEST, repository: "reactjs" }],
      ["github で glob が / で始まる", { ...GITHUB_REQUEST, include_globs: ["/src/**/*.md"] }],
      ["github で include_globs が空", { ...GITHUB_REQUEST, include_globs: [] }],
      ["github で public_url_template に {path} が無い", { ...GITHUB_REQUEST, public_url_template: "https://react.dev/" }],
      ["許可リスト外のライセンス（CC-BY-SA-4.0）", { ...GITHUB_REQUEST, license_spdx: "CC-BY-SA-4.0" }],
      ["license_url が http(s) でない", { ...GITHUB_REQUEST, license_url: "javascript:alert(1)" }],
      ["fetch_type が無い", { ...GITHUB_REQUEST, fetch_type: undefined }],
      ["website で sitemap_url と start_url が両方 null", { ...WEBSITE_REQUEST, sitemap_url: null, start_url: null }],
      ["website で site_url が http", { ...WEBSITE_REQUEST, site_url: "http://go.dev" }],
      ["website で sitemap_url が別オリジン", { ...WEBSITE_REQUEST, sitemap_url: "https://example.com/sitemap.xml" }],
      ["website で start_url が別オリジン", { ...WEBSITE_REQUEST, start_url: "https://go.dev.example.com/doc/" }],
      ["website で sitemap_url が URL でない", { ...WEBSITE_REQUEST, sitemap_url: "not a url" }],
      ["website で glob が / で始まらない", { ...WEBSITE_REQUEST, include_globs: ["doc/**"] }],
      ["website で exclude_globs が / で始まらない", { ...WEBSITE_REQUEST, exclude_globs: ["doc/devel/**"] }],
      ["tag_ids に重複がある", { ...GITHUB_REQUEST, tag_ids: [1, 1] }],
      ["tag_ids が 11 個", { ...GITHUB_REQUEST, tag_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
      ["tag_ids が 0", { ...GITHUB_REQUEST, tag_ids: [0] }],
      ["tag_ids が無い（古い形の tags だけ）", { ...omitTagIds(GITHUB_REQUEST), tags: ["react"] }],
    ])("%sなら 400 を返し、DB に保存しない", async (_label, body) => {
      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(await testDb.$count(contentSources)).toBe(0)
    })

    it("存在しない tag の id なら 400 と tag_ids の details を返し、DB に保存しない", async () => {
      const [react] = await insertTags(["react"])

      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...GITHUB_REQUEST, tag_ids: [react.id, react.id + 1000] })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({
        details: [{ code: "tag_not_found", message: expect.any(String), path: ["tag_ids"] }],
        error: expect.any(String),
        status_code: 400,
      })
      expect(await testDb.$count(contentSources)).toBe(0)
      expect(await testDb.$count(contentSourceTags)).toBe(0)
    })

    it("登録済みの repository なら 409 を返し、DB に保存しない", async () => {
      await insertGitHubSource()

      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...GITHUB_REQUEST, name: "dup" })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await testDb.$count(contentSources)).toBe(1)
    })

    it("大文字・小文字だけが違う登録済みの repository なら 409 を返し、DB に保存しない", async () => {
      await insertGitHubSource()

      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...GITHUB_REQUEST, name: "dup", repository: "ReactJS/react.dev" })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await testDb.$count(contentSources)).toBe(1)
    })

    it("登録済みの site_url（オリジンにそろえて同じ）なら 409 を返し、DB に保存しない", async () => {
      await insertWebsiteSource()

      const res = await request(app)
        .post("/api/admin/content-source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...WEBSITE_REQUEST, site_url: "https://go.dev/doc/" })

      expect(res.status).toBe(409)
      expect(await testDb.$count(contentSources)).toBe(1)
    })

    it("Authorization が無ければ 401 を返し、DB に保存しない", async () => {
      const res = await request(app).post("/api/admin/content-source").send(GITHUB_REQUEST)

      expect(res.status).toBe(401)
      expect(await testDb.$count(contentSources)).toBe(0)
    })
  })
})
