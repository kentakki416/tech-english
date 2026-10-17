import request from "supertest"

import { eq, passageAudios } from "@repo/db"

import { AdminPassageRegenerateAudioController } from "../../../../src/controller/admin/passage/regenerate-audio"
import { DrizzlePassageAudioRepository } from "../../../../src/repository/drizzle/passage-audio-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage, insertPassageAudio } from "../../../fixture/passage"
import { buildAudioManifest } from "../../../fixture/passage-audio"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageAudioRepository = new DrizzlePassageAudioRepository(testDb)

const app = createTestApp()

mountAdminApi(app, adminRouter({ passage: { regenerateAudio: new AdminPassageRegenerateAudioController(passageAudioRepository) } }))
attachUnhandledExceptionHandler(app)

let adminToken: string

const PUBLISHED_AT = new Date("2026-10-12T03:00:00.000Z")

/**
 * insertPassageAudio の updated_at（音声を作った時刻）
 */
const AUDIO_UPDATED_AT = new Date("2026-10-12T04:00:00.000Z")

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
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/passage/:id/audio/regenerate", () => {
  describe("正常系", () => {
    it("作成済みの音声に作り直しの依頼を入れて 200 を返す。状態・マニフェスト・updated_at は変えない", async () => {
      const passage = await insertPublishedPassage()
      await insertPassageAudio(passage.id)

      const res = await request(app).post(`/api/admin/passage/${passage.id}/audio/regenerate`).set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ passage_id: passage.id, regenerate_requested_at: expect.any(String) })
      const row = await selectAudio(passage.id)
      expect(row).toMatchObject({
        manifest: buildAudioManifest(passage.id),
        regenerateRequestedAt: new Date(res.body.regenerate_requested_at),
        status: "ready",
        updatedAt: AUDIO_UPDATED_AT,
      })
    })

    it("作り直しに失敗している ready（失敗の上限に達して取られなくなった行）は、失敗の回数とエラーを消して依頼を入れる", async () => {
      const passage = await insertPublishedPassage()
      await insertPassageAudio(passage.id, { attemptCount: 3, lastError: "ServiceFailureException: Polly is unavailable" })

      const res = await request(app).post(`/api/admin/passage/${passage.id}/audio/regenerate`).set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(await selectAudio(passage.id)).toMatchObject({
        attemptCount: 0,
        lastError: null,
        regenerateRequestedAt: expect.any(Date),
        status: "ready",
      })
    })
  })

  describe("異常系", () => {
    it.each([
      ["pending", { status: "pending" as const }],
      ["generating", { generationStartedAt: new Date(), status: "generating" as const }],
      ["failed", { status: "failed" as const }],
    ])("%s の音声なら 409 を返し、行を変えない", async (status, overrides) => {
      const passage = await insertPublishedPassage()
      await insertPassageAudio(passage.id, { attemptCount: 1, lastError: "error", ...overrides })

      const res = await request(app).post(`/api/admin/passage/${passage.id}/audio/regenerate`).set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await selectAudio(passage.id)).toMatchObject({ attemptCount: 1, lastError: "error", regenerateRequestedAt: null, status })
    })

    it("非公開に戻した問題の ready（表示は準備中）なら 409 を返し、行を変えない", async () => {
      const { passage } = await insertGeneratedPassage({ publishedAt: PUBLISHED_AT, status: "draft" })
      await insertPassageAudio(passage.id)

      const res = await request(app).post(`/api/admin/passage/${passage.id}/audio/regenerate`).set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(409)
      expect(await selectAudio(passage.id)).toMatchObject({ regenerateRequestedAt: null, status: "ready" })
    })

    it("音声の行が無ければ 409 を返し、行を作らない", async () => {
      const passage = await insertPublishedPassage()

      const res = await request(app).post(`/api/admin/passage/${passage.id}/audio/regenerate`).set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(409)
      expect(await selectAudio(passage.id)).toBeUndefined()
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app).post("/api/admin/passage/999999/audio/regenerate").set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("Authorization が無ければ 401 を返し、行を変えない", async () => {
      const passage = await insertPublishedPassage()
      await insertPassageAudio(passage.id)

      const res = await request(app).post(`/api/admin/passage/${passage.id}/audio/regenerate`)

      expect(res.status).toBe(401)
      expect(await selectAudio(passage.id)).toMatchObject({ regenerateRequestedAt: null })
    })

    it("id が数値でなければ 400 を返す", async () => {
      const res = await request(app).post("/api/admin/passage/abc/audio/regenerate").set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })
  })
})
