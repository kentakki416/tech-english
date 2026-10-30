import request from "supertest"

import { eq, sourceCollectionRuns } from "@repo/db"

import { AdminSourceDetailController } from "../../../../src/controller/admin/source/detail"
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
  source: { detail: new AdminSourceDetailController(sourceRepository, sourceCollectionRunRepository) },
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

describe("GET /api/admin/source/:id", () => {
  describe("正常系", () => {
    it("github のソースを github の形で返し、タグ（名前の順）と状態別の件数を付ける", async () => {
      const github = await insertGitHubSource({ lastCollectedCommitSha: "abc123" })
      const [react, frontend] = await insertSourceTags(github.id, ["react", "Frontend"])
      const document = await insertSourceDocument(github.id, "src/content/learn/a.md")
      await insertPassages(document.id, "draft", 2)
      await insertPassages(document.id, "failed", 1)

      const res = await request(app)
        .get(`/api/admin/source/${github.id}`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        latest_collection_run: null,
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
          repository: "reactjs/react.dev",
          tags: [
            { id: frontend.id, color: frontend.color, name: "Frontend" },
            { id: react.id, color: react.color, name: "react" },
          ],
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
      })
    })

    it("website のソースを website の形で返し、タグの無いソースは tags: []", async () => {
      const website = await insertWebsiteSource()

      const res = await request(app)
        .get(`/api/admin/source/${website.id}`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        latest_collection_run: null,
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
          site_url: "https://go.dev",
          tags: [],
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
      })
    })

    it("最後の収集の記録（最新の 1 件）を返す", async () => {
      const github = await insertGitHubSource()
      await insertSourceCollectionRun({ sourceId: github.id, status: "failed" })
      const latest = await insertSourceCollectionRun({
        createdPassageCount: 12,
        fetchedDocumentCount: 5,
        finishedAt: new Date("2026-10-22T03:05:00.000Z"),
        sourceId: github.id,
        startedAt: new Date("2026-10-22T03:01:00.000Z"),
        status: "completed",
      })

      const res = await request(app)
        .get(`/api/admin/source/${github.id}`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.latest_collection_run).toEqual({
        id: latest.id,
        created_passage_count: 12,
        error: null,
        fetched_document_count: 5,
        finished_at: "2026-10-22T03:05:00.000Z",
        started_at: "2026-10-22T03:01:00.000Z",
        status: "completed",
        created_at: expect.any(String),
      })
    })

    it("30 分より前から running のままの記録は failed にしてから返す", async () => {
      const github = await insertGitHubSource()
      const run = await insertSourceCollectionRun({ sourceId: github.id, startedAt: new Date(Date.now() - 31 * 60_000), status: "running" })

      const res = await request(app)
        .get(`/api/admin/source/${github.id}`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.latest_collection_run).toMatchObject({ error: expect.any(String), id: run.id, status: "failed" })
      const [row] = await testDb.select().from(sourceCollectionRuns).where(eq(sourceCollectionRuns.id, run.id))
      expect(row).toMatchObject({ finishedAt: expect.any(Date), status: "failed" })
    })
  })

  describe("異常系", () => {
    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .get("/api/admin/source/999999")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it.each(["abc", "0", "-1", "1.5", "2147483648"])(":id が %s なら 400 を返す", async (id) => {
      const res = await request(app)
        .get(`/api/admin/source/${id}`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("Authorization が無ければ 401 を返す", async () => {
      const github = await insertGitHubSource()

      const res = await request(app).get(`/api/admin/source/${github.id}`)

      expect(res.status).toBe(401)
    })
  })
})
