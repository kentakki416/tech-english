import request from "supertest"

import { eq, passages, readingAttempts, sourceCollectionRuns, sourceDocuments, sources } from "@repo/db"

import { AdminSourceCreateController } from "../../../../src/controller/admin/source/create"
import { AdminSourceDeleteController } from "../../../../src/controller/admin/source/delete"
import { DrizzleSourceCollectionRunRepository } from "../../../../src/repository/drizzle/source-collection-run-repository"
import { DrizzleSourceRepository } from "../../../../src/repository/drizzle/source-repository"
import { DrizzleTagRepository } from "../../../../src/repository/drizzle/tag-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { insertReadingAttempt } from "../../../fixture/passage"
import { insertSourceCollectionRun } from "../../../fixture/source-collection-run"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { GITHUB_REQUEST, insertGitHubSource, insertPassages, insertSourceDocument, insertWebsiteSource } from "./fixtures"

const app = createTestApp()

const sourceRepository = new DrizzleSourceRepository(testDb)

mountAdminApi(app, adminRouter({
  source: {
    create: new AdminSourceCreateController(sourceRepository, new DrizzleTagRepository(testDb), { isWebsiteSourceAllowed: true }),
    delete: new AdminSourceDeleteController(sourceRepository, new DrizzleSourceCollectionRunRepository(testDb)),
  },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

const del = (id: number | string) => request(app).delete(`/api/admin/source/${id}`).set("Authorization", `Bearer ${adminToken}`)

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("DELETE /api/admin/source/:id", () => {
  describe("正常系", () => {
    it("204 でボディが空になり、ソースと本文候補が消える", async () => {
      const source = await insertGitHubSource()
      const document = await insertSourceDocument(source.id, "docs/index.md")
      await insertPassages(document.id, "collected", 2)
      await insertPassages(document.id, "draft", 1)
      await insertPassages(document.id, "rejected", 1)

      const res = await del(source.id)

      expect(res.status).toBe(204)
      expect(res.text).toBe("")
      expect(await testDb.select().from(sources)).toHaveLength(0)
      expect(await testDb.select().from(sourceDocuments)).toHaveLength(0)
      expect(await testDb.select().from(passages)).toHaveLength(0)
    })

    it("公開中の問題と解答の記録があっても消す", async () => {
      const source = await insertGitHubSource()
      const document = await insertSourceDocument(source.id, "docs/index.md")
      await insertPassages(document.id, "published", 1)
      const [passage] = await testDb.select().from(passages)
      await insertReadingAttempt(passage.id)

      const res = await del(source.id)

      expect(res.status).toBe(204)
      expect(await testDb.select().from(sources)).toHaveLength(0)
      expect(await testDb.select().from(passages)).toHaveLength(0)
      expect(await testDb.select().from(readingAttempts)).toHaveLength(0)
    })

    it("サイトのソースも消せる", async () => {
      const source = await insertWebsiteSource()

      const res = await del(source.id)

      expect(res.status).toBe(204)
      expect(await testDb.select().from(sources)).toHaveLength(0)
    })

    it("時間切れの収集の記録は片付けて消す", async () => {
      const source = await insertGitHubSource()
      await insertSourceCollectionRun({ sourceId: source.id, startedAt: new Date("2020-01-01T00:00:00.000Z"), status: "running" })

      const res = await del(source.id)

      expect(res.status).toBe(204)
      expect(await testDb.select().from(sources)).toHaveLength(0)
    })

    it("消した同じリポジトリをもう一度登録できる", async () => {
      const source = await insertGitHubSource({ repository: GITHUB_REQUEST.repository })
      await del(source.id)

      const res = await request(app)
        .post("/api/admin/source")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(GITHUB_REQUEST)

      expect(res.status).toBe(201)
    })
  })

  describe("異常系", () => {
    it("収集中なら 409 を返し、公開中の問題も記録も消さない", async () => {
      const source = await insertGitHubSource()
      const document = await insertSourceDocument(source.id, "docs/index.md")
      await insertPassages(document.id, "published", 1)
      await insertSourceCollectionRun({ sourceId: source.id, startedAt: new Date(), status: "running" })

      const res = await del(source.id)

      expect(res.status).toBe(409)
      expect(await testDb.select().from(passages)).toHaveLength(1)
      expect(await testDb.select().from(sources)).toHaveLength(1)
      expect(await testDb.select().from(sourceCollectionRuns).where(eq(sourceCollectionRuns.sourceId, source.id))).toHaveLength(1)
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await del(999999)

      expect(res.status).toBe(404)
    })

    it("id が数値でないと 400 を返す", async () => {
      const res = await del("abc")

      expect(res.status).toBe(400)
    })

    it("admin の token が無いと 401 を返す", async () => {
      const res = await request(app).delete("/api/admin/source/1")

      expect(res.status).toBe(401)
    })
  })
})
