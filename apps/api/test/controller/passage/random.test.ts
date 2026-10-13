import request from "supertest"

import { PassageDetailController } from "../../../src/controller/passage/detail"
import { PassageRandomController } from "../../../src/controller/passage/random"
import { DrizzlePassageRepository } from "../../../src/repository/drizzle/passage-repository"
import { DrizzleReadingAttemptRepository } from "../../../src/repository/drizzle/reading-attempt-repository"
import { passageRouter } from "../../../src/routes/passage-router"
import {
  insertGeneratedPassage,
  insertPassageDocument,
  insertPassageSource,
  insertPublishedPassage,
  insertReadingAttempt,
  insertSubmittedAttempt,
} from "../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const passageRepository = new DrizzlePassageRepository(testDb)
const readingAttemptRepository = new DrizzleReadingAttemptRepository(testDb)

const app = createTestApp()

/**
 * /:id と同じルーターに登録し、/random が /:id より先に解決されることも確かめる
 */
app.use(
  "/api/passage",
  passageRouter({
    detail: new PassageDetailController(passageRepository, readingAttemptRepository),
    random: new PassageRandomController(passageRepository, readingAttemptRepository),
  }),
)
attachUnhandledExceptionHandler(app)

/**
 * 同じソースの公開中の問題を count 件入れる
 */
const insertPublishedPassages = async (count: number, tags = ["react"]) => {
  const source = await insertPassageSource({ tags })
  const document = await insertPassageDocument(source.id)
  const rows = []
  for (let index = 0; index < count; index++) rows.push(await insertPublishedPassage(document.id))
  return rows
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/passage/random", () => {
  describe("正常系", () => {
    it("未挑戦の問題があればそれを返す（挑戦中の問題も未挑戦に含む）", async () => {
      const [submitted, inProgress] = await insertPublishedPassages(2)
      const { token, user } = await createTestUser()
      await insertSubmittedAttempt(submitted.id, user.id, 3)
      await insertReadingAttempt(inProgress.id, { userId: user.id })

      const res = await request(app).get("/api/passage/random").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: inProgress.id })
    })

    it("全部提出済みなら提出済みの問題から返す", async () => {
      const [first, second] = await insertPublishedPassages(2)
      const { token, user } = await createTestUser()
      await insertSubmittedAttempt(first.id, user.id, 3)
      await insertSubmittedAttempt(second.id, user.id, 1)

      const res = await request(app).get("/api/passage/random").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect([first.id, second.id]).toContain(res.body.id)
    })

    it("絞り込み（kind・tag・difficulty）に合う問題から選ぶ", async () => {
      await insertPublishedPassages(2, ["react"])
      const [rust] = await insertPublishedPassages(1, ["rust"])
      const { token } = await createTestUser()

      const res = await request(app)
        .get("/api/passage/random?kind=docs&tag=go,rust&difficulty=2")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: rust.id })
    })
  })

  describe("異常系", () => {
    it("Authorization ヘッダが無ければ 401 を返す", async () => {
      const res = await request(app).get("/api/passage/random")

      expect(res.status).toBe(401)
    })

    it("条件に合う公開中の問題が無ければ 404 を返す（下書きは選ばない）", async () => {
      await insertGeneratedPassage()
      await insertPublishedPassages(1, ["react"])
      const { token } = await createTestUser()

      const res = await request(app).get("/api/passage/random?tag=rust").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("difficulty=4 なら 400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/passage/random?difficulty=4").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
    })
  })
})
