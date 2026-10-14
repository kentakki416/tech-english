import request from "supertest"

import { eq, passageAudios } from "@repo/db"

import { AdminPassageRetryAudioController } from "../../../../src/controller/admin/passage/retry-audio"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzlePassageAudioRepository } from "../../../../src/repository/drizzle/passage-audio-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage, insertPassageAudio } from "../../../fixture/passage"
import { buildAudioManifest } from "../../../fixture/passage-audio"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageAudioRepository = new DrizzlePassageAudioRepository(testDb)

const app = createTestApp()

app.use("/api/admin", adminRouter({ passage: { retryAudio: new AdminPassageRetryAudioController(passageAudioRepository) } }))
attachUnhandledExceptionHandler(app)

const PUBLISHED_AT = new Date("2026-10-12T03:00:00.000Z")

const insertPublishedPassage = async () => {
  const { passage } = await insertGeneratedPassage({ publishedAt: PUBLISHED_AT, status: "published" })
  return passage
}

const selectAudio = async (passageId: number) => {
  const [row] = await testDb.select().from(passageAudios).where(eq(passageAudios.passageId, passageId))
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

describe("POST /api/admin/passage/:id/audio/retry", () => {
  describe("正常系", () => {
    it("failed の音声を pending・attempt_count = 0・last_error = null に戻して 200 を返す", async () => {
      const passage = await insertPublishedPassage()
      await insertPassageAudio(passage.id, {
        attemptCount: 3,
        lastError: "ServiceFailureException: Polly is unavailable",
        status: "failed",
      })

      const res = await request(app).post(`/api/admin/passage/${passage.id}/audio/retry`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ passage_id: passage.id, status: "pending" })
      expect(await selectAudio(passage.id)).toMatchObject({
        attemptCount: 0,
        lastError: null,
        manifest: buildAudioManifest(passage.id),
        status: "pending",
      })
    })
  })

  describe("異常系", () => {
    it.each([
      ["ready", { status: "ready" as const }],
      ["generating", { generationStartedAt: new Date(), status: "generating" as const }],
      ["pending", { status: "pending" as const }],
    ])("%s の音声なら 409 を返し、行を変えない", async (status, overrides) => {
      const passage = await insertPublishedPassage()
      await insertPassageAudio(passage.id, { attemptCount: 1, lastError: "error", ...overrides })

      const res = await request(app).post(`/api/admin/passage/${passage.id}/audio/retry`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await selectAudio(passage.id)).toMatchObject({ attemptCount: 1, lastError: "error", status })
    })

    it("音声の行が無ければ 409 を返し、行を作らない", async () => {
      const passage = await insertPublishedPassage()

      const res = await request(app).post(`/api/admin/passage/${passage.id}/audio/retry`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await selectAudio(passage.id)).toBeUndefined()
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app).post("/api/admin/passage/999999/audio/retry").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("X-Admin-Token が無ければ 401 を返し、行を変えない", async () => {
      const passage = await insertPublishedPassage()
      await insertPassageAudio(passage.id, { attemptCount: 3, lastError: "error", status: "failed" })

      const res = await request(app).post(`/api/admin/passage/${passage.id}/audio/retry`)

      expect(res.status).toBe(401)
      expect(await selectAudio(passage.id)).toMatchObject({ attemptCount: 3, status: "failed" })
    })

    it("id が数値でなければ 400 を返す", async () => {
      const res = await request(app).post("/api/admin/passage/abc/audio/retry").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(400)
    })
  })
})
