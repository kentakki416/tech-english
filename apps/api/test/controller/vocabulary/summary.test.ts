import request from "supertest"

import { VocabularySummaryController } from "../../../src/controller/vocabulary/summary"
import { generateAccessToken } from "../../../src/lib/jwt"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { DrizzleVocabularyRepository } from "../../../src/repository/drizzle/vocabulary-repository"
import { vocabularyRouter } from "../../../src/routes/vocabulary-router"
import { insertReadPassage, insertVocabularyCard } from "../../fixture/vocabulary"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const app = createTestApp()

app.use(
  "/api/vocabulary",
  vocabularyRouter({ summary: new VocabularySummaryController(new DrizzleUserRepository(testDb), new DrizzleVocabularyRepository(testDb)) }),
)
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/vocabulary/summary", () => {
  describe("正常系", () => {
    it("問題を解いていないユーザーはすべて 0 で、次の復習の日は null", async () => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/vocabulary/summary").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ due_count: 0, learning_count: 0, mastered_count: 0, new_count: 0, next_due_date: null })
    })

    it("今日の復習・新しい単語・復習中・覚えた単語の数と次の復習の日を返す", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      await insertVocabularyCard(user.id, { dueDate: "2026-01-01", lemma: "opt out of", stage: 1 })
      await insertVocabularyCard(user.id, { dueDate: "2999-12-31", lemma: "escape hatch", stage: 3 })
      await insertVocabularyCard(user.id, { dueDate: null, lemma: "resilient", stage: 4 })

      const res = await request(app).get("/api/vocabulary/summary").set("Authorization", `Bearer ${token}`)

      expect(res.body).toEqual({ due_count: 1, learning_count: 2, mastered_count: 1, new_count: 1, next_due_date: "2999-12-31" })
    })
  })

  describe("異常系", () => {
    it("トークンなしは 401", async () => {
      expect((await request(app).get("/api/vocabulary/summary")).status).toBe(401)
    })

    it("トークンのユーザーが存在しなければ 401", async () => {
      const res = await request(app).get("/api/vocabulary/summary").set("Authorization", `Bearer ${generateAccessToken(999999)}`)
      expect(res.status).toBe(401)
    })
  })
})
