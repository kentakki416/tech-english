import request from "supertest"

import { sourceCollectionRuns } from "@repo/db"
import type { CollectSourceJobData } from "@repo/queue"

import { AdminSourceCollectController } from "../../../../src/controller/admin/source/collect"
import { DrizzleSourceCollectionRunRepository } from "../../../../src/repository/drizzle/source-collection-run-repository"
import { DrizzleSourceRepository } from "../../../../src/repository/drizzle/source-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { FakeJobQueue } from "../../../fixture/fake-job-queue"
import { insertSourceCollectionRun } from "../../../fixture/source-collection-run"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { insertGitHubSource, insertWebsiteSource } from "./fixtures"

const collectSourceQueue = new FakeJobQueue<CollectSourceJobData>()

const app = createTestApp()

mountAdminApi(app, adminRouter({
  source: {
    collect: new AdminSourceCollectController(
      new DrizzleSourceRepository(testDb),
      new DrizzleSourceCollectionRunRepository(testDb),
      collectSourceQueue,
    ),
  },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

beforeEach(async () => {
  await cleanupTestData()
  collectSourceQueue.clear()
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/source/:id/collection-runs", () => {
  describe("正常系", () => {
    it("有効な GitHub のソースなら 202 と queued の記録を返し、記録の id を Queue に積む", async () => {
      const github = await insertGitHubSource()

      const res = await request(app)
        .post(`/api/admin/source/${github.id}/collection-runs`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(202)
      expect(res.body).toEqual({
        collection_run: {
          id: expect.any(Number),
          created_passage_count: null,
          error: null,
          fetched_document_count: null,
          finished_at: null,
          started_at: null,
          status: "queued",
          created_at: expect.any(String),
        },
      })
      const runs = await testDb.select().from(sourceCollectionRuns)
      expect(runs).toHaveLength(1)
      expect(runs[0]).toMatchObject({ id: res.body.collection_run.id, sourceId: github.id, status: "queued" })
      expect(collectSourceQueue.enqueued).toEqual([
        { data: { runId: res.body.collection_run.id }, options: { jobId: `collect-source-run-${res.body.collection_run.id}` } },
      ])
    })

    it("前の収集が終わっていれば、もう一度依頼できる", async () => {
      const github = await insertGitHubSource()
      await insertSourceCollectionRun({ sourceId: github.id, status: "completed" })

      const res = await request(app)
        .post(`/api/admin/source/${github.id}/collection-runs`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(202)
      expect(await testDb.select().from(sourceCollectionRuns)).toHaveLength(2)
    })

    it("30 分より前から queued のままの記録は failed にしてから、新しく依頼できる", async () => {
      const github = await insertGitHubSource()
      await insertSourceCollectionRun({ createdAt: new Date(Date.now() - 31 * 60_000), sourceId: github.id, status: "queued" })

      const res = await request(app)
        .post(`/api/admin/source/${github.id}/collection-runs`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(202)
      const statuses = (await testDb.select().from(sourceCollectionRuns)).map((run) => run.status).sort()
      expect(statuses).toEqual(["failed", "queued"])
    })
  })

  describe("異常系", () => {
    it("収集中なら 409 を返し、記録を足さず Queue にも積まない", async () => {
      const github = await insertGitHubSource()
      await insertSourceCollectionRun({ sourceId: github.id, startedAt: new Date(), status: "running" })

      const res = await request(app)
        .post(`/api/admin/source/${github.id}/collection-runs`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await testDb.select().from(sourceCollectionRuns)).toHaveLength(1)
      expect(collectSourceQueue.enqueued).toEqual([])
    })

    it.each([
      ["サイトのソース", async () => insertWebsiteSource()],
      ["無効の GitHub のソース", async () => insertGitHubSource({ isEnabled: false })],
    ])("%sなら 400 を返し、記録を作らない", async (_label, insertSource) => {
      const source = await insertSource()

      const res = await request(app)
        .post(`/api/admin/source/${source.id}/collection-runs`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(await testDb.select().from(sourceCollectionRuns)).toEqual([])
      expect(collectSourceQueue.enqueued).toEqual([])
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .post("/api/admin/source/999999/collection-runs")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it(":id が数値でなければ 400 を返す", async () => {
      const res = await request(app)
        .post("/api/admin/source/abc/collection-runs")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })

    it("Authorization が無ければ 401 を返し、記録を作らない", async () => {
      const github = await insertGitHubSource()

      const res = await request(app).post(`/api/admin/source/${github.id}/collection-runs`)

      expect(res.status).toBe(401)
      expect(await testDb.select().from(sourceCollectionRuns)).toEqual([])
    })
  })
})
