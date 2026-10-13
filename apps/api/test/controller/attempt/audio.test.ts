import request from "supertest"

import { eq, passages } from "@repo/db"

import { AttemptAudioController } from "../../../src/controller/attempt/audio"
import { DrizzlePassageAudioRepository } from "../../../src/repository/drizzle/passage-audio-repository"
import { DrizzleReadingAttemptRepository } from "../../../src/repository/drizzle/reading-attempt-repository"
import { attemptRouter } from "../../../src/routes/attempt-router"
import { insertGeneratedPassage, insertPassageAudio, insertReadingAttempt, insertSubmittedAttempt } from "../../fixture/passage"
import { AUDIO_TEXT_HASH } from "../../fixture/passage-audio"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const AUDIO_PUBLIC_URL_BASE = "https://audio.example.com/"

const passageAudioRepository = new DrizzlePassageAudioRepository(testDb)
const readingAttemptRepository = new DrizzleReadingAttemptRepository(testDb)

const app = createTestApp()

app.use(
  "/api/attempt",
  attemptRouter({ audio: new AttemptAudioController(passageAudioRepository, readingAttemptRepository, AUDIO_PUBLIC_URL_BASE) }),
)
attachUnhandledExceptionHandler(app)

/**
 * audioPublicUrlBase が null（production で AUDIO_PUBLIC_URL_BASE が未設定）のときの app
 */
const appWithoutBase = createTestApp()

appWithoutBase.use("/api/attempt", attemptRouter({ audio: new AttemptAudioController(passageAudioRepository, readingAttemptRepository, null) }))
attachUnhandledExceptionHandler(appWithoutBase)

const PUBLISHED_AT = new Date("2026-10-12T03:00:00.000Z")

/**
 * 公開中の問題と、ログインしたユーザーの挑戦中を入れる
 */
const setupAttempt = async () => {
  const { passage } = await insertGeneratedPassage({ publishedAt: PUBLISHED_AT, status: "published" })
  const { token, user } = await createTestUser()
  const attempt = await insertReadingAttempt(passage.id, { userId: user.id })
  return { attempt, passage, token, user }
}

/**
 * ready のマニフェスト（test/fixture/passage-audio.ts の buildAudioManifest）の URL の形
 */
const buildExpectedReadyResponse = (passageId: number) => {
  const urlPrefix = `https://audio.example.com/passages/${passageId}/${AUDIO_TEXT_HASH}`
  return {
    blocks: [
      { block_index: 0, parts: [{ duration_ms: 1200, url: `${urlPrefix}/0-0.mp3`, words: [[0, 600, 0, 13], [600, 1200, 14, 18]] }] },
      { block_index: 1, parts: [{ duration_ms: 2400, url: `${urlPrefix}/1-0.mp3`, words: [[0, 2400, 0, 7]] }] },
      {
        block_index: 2,
        parts: [
          { duration_ms: 900, url: `${urlPrefix}/2-0.mp3`, words: [[0, 900, 0, 2]] },
          { duration_ms: 700, url: `${urlPrefix}/2-1.mp3`, words: [[0, 700, 30, 36]] },
        ],
      },
      { block_index: 4, parts: [{ duration_ms: 1500, url: `${urlPrefix}/4-0.mp3`, words: [] }] },
    ],
    status: "ready",
  }
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/attempt/:id/audio", () => {
  describe("正常系", () => {
    it("ready の音声なら、url が AUDIO_PUBLIC_URL_BASE + キーのパートと単語の時刻のタプルを返す", async () => {
      const { attempt, passage, token } = await setupAttempt()
      await insertPassageAudio(passage.id)

      const res = await request(app).get(`/api/attempt/${attempt.id}/audio`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual(buildExpectedReadyResponse(passage.id))
      expect(res.body.blocks[0].parts[0].words[0]).toEqual([expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)])
    })

    it("提出済みの挑戦でも音声を返す", async () => {
      const { passage, token, user } = await setupAttempt()
      const submitted = await insertSubmittedAttempt(passage.id, user.id, 2)
      await insertPassageAudio(passage.id)

      const res = await request(app).get(`/api/attempt/${submitted.id}/audio`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual(buildExpectedReadyResponse(passage.id))
    })

    it("音声の行が無ければ pending だけを返す", async () => {
      const { attempt, token } = await setupAttempt()

      const res = await request(app).get(`/api/attempt/${attempt.id}/audio`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: "pending" })
    })

    it("generating の行は pending だけを返す", async () => {
      const { attempt, passage, token } = await setupAttempt()
      await insertPassageAudio(passage.id, { generationStartedAt: new Date(), status: "generating" })

      const res = await request(app).get(`/api/attempt/${attempt.id}/audio`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: "pending" })
    })

    it("音声を作った後に公開し直された問題は pending だけを返す", async () => {
      const { attempt, passage, token } = await setupAttempt()
      await insertPassageAudio(passage.id)
      await testDb.update(passages).set({ publishedAt: new Date("2026-10-12T05:00:00.000Z") }).where(eq(passages.id, passage.id))

      const res = await request(app).get(`/api/attempt/${attempt.id}/audio`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: "pending" })
    })

    it("failed の行は failed だけを返す", async () => {
      const { attempt, passage, token } = await setupAttempt()
      await insertPassageAudio(passage.id, { attemptCount: 3, lastError: "ServiceFailureException", status: "failed" })

      const res = await request(app).get(`/api/attempt/${attempt.id}/audio`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: "failed" })
    })

    it("audioPublicUrlBase が null なら ready の音声があっても pending だけを返す", async () => {
      const { attempt, passage, token } = await setupAttempt()
      await insertPassageAudio(passage.id)

      const res = await request(appWithoutBase).get(`/api/attempt/${attempt.id}/audio`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: "pending" })
    })
  })

  describe("異常系", () => {
    it("Authorization ヘッダが無ければ 401 を返す", async () => {
      const res = await request(app).get("/api/attempt/1/audio")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("他人の挑戦なら 404 を返す", async () => {
      const { attempt, passage } = await setupAttempt()
      await insertPassageAudio(passage.id)
      const { token } = await createTestUser({ email: "other@example.com" })

      const res = await request(app).get(`/api/attempt/${attempt.id}/audio`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("存在しない ID なら 404 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/attempt/999999/audio").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("id が数値でなければ 400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/attempt/abc/audio").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
    })
  })
})
