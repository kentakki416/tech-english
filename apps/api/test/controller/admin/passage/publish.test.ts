import request from "supertest"

import { eq, passageAudios, passages, questions } from "@repo/db"

import { AdminPassagePublishController } from "../../../../src/controller/admin/passage/publish"
import { DrizzlePassageAudioRepository } from "../../../../src/repository/drizzle/passage-audio-repository"
import { DrizzlePassageRepository } from "../../../../src/repository/drizzle/passage-repository"
import { DrizzleTransactionRunner } from "../../../../src/repository/drizzle/transaction-runner"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage, insertPassageAudio } from "../../../fixture/passage"
import { buildAudioManifest } from "../../../fixture/passage-audio"
import { PASSAGE_BLOCKS } from "../../../fixture/passage-content"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageRepository = new DrizzlePassageRepository(testDb)

const passageAudioRepository = new DrizzlePassageAudioRepository(testDb)

const app = createTestApp()

mountAdminApi(app, adminRouter({
  passage: { publish: new AdminPassagePublishController(passageRepository, passageAudioRepository, new DrizzleTransactionRunner(testDb)) },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

const selectPassage = async (id: number) => {
  const [row] = await testDb.select().from(passages).where(eq(passages.id, id))
  return row
}

const selectAudio = async (passageId: number) => {
  const [row] = await testDb.select().from(passageAudios).where(eq(passageAudios.passageId, passageId))
  return row
}

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/passage/:id/publish", () => {
  describe("正常系", () => {
    it("公開の条件を満たす下書きを公開し、published_at / reviewed_at を記録する", async () => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/publish`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: passage.id, status: "published" })
      expect(await selectPassage(passage.id)).toMatchObject({
        publishedAt: expect.any(Date),
        reviewedAt: expect.any(Date),
        status: "published",
      })
    })

    it("読み上げの音声が failed なら pending に戻し、失敗の回数とエラーを消す（マニフェストは残す）", async () => {
      const { passage } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-12T03:00:00.000Z") })
      await insertPassageAudio(passage.id, { attemptCount: 3, lastError: "ServiceFailureException: Polly is unavailable", status: "failed" })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/publish`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(await selectAudio(passage.id)).toMatchObject({
        attemptCount: 0,
        lastError: null,
        manifest: buildAudioManifest(passage.id),
        status: "pending",
      })
    })

    it("読み上げの音声が ready なら変えない（生成タスクが公開し直しを見て本文を確かめる）", async () => {
      const { passage } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-12T03:00:00.000Z") })
      await insertPassageAudio(passage.id)

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/publish`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(await selectAudio(passage.id)).toMatchObject({
        status: "ready",
        updatedAt: new Date("2026-10-12T04:00:00.000Z"),
      })
    })
  })

  describe("異常系", () => {
    it("公開の条件を満たさなければ 400 と満たしていない条件の details を返し、公開しない", async () => {
      const blocks = PASSAGE_BLOCKS.map((block, index) => (index === 4 ? { text: block.text, type: block.type } : block))
      const { passage, questions: questionRows } = await insertGeneratedPassage({ blocks })
      await testDb.update(questions).set({ evidenceQuote: "it belongs in a reducer" }).where(eq(questions.id, questionRows[1].id))

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/publish`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({
        details: [
          { code: "evidence_not_found", message: expect.any(String), path: ["questions", 1, "evidence"] },
          { code: "translation_missing", message: expect.any(String), path: ["blocks", 4, "translation_ja"] },
        ],
        error: expect.any(String),
        status_code: 400,
      })
      expect(await selectPassage(passage.id)).toMatchObject({ publishedAt: null, status: "draft" })
    })

    it("公開中の問題は 409 を返し、failed の音声も戻さない", async () => {
      const { passage } = await insertGeneratedPassage({ status: "published" })
      await insertPassageAudio(passage.id, { attemptCount: 3, lastError: "error", status: "failed" })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/publish`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await selectAudio(passage.id)).toMatchObject({ attemptCount: 3, status: "failed" })
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .post("/api/admin/passage/999999/publish")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("Authorization が無ければ 401 を返し、公開しない", async () => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app).post(`/api/admin/passage/${passage.id}/publish`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await selectPassage(passage.id)).toMatchObject({ status: "draft" })
    })
  })
})
