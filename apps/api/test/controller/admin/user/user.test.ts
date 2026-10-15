import request from "supertest"

import { authAccounts } from "@repo/db"

import { AdminUserAttemptsController } from "../../../../src/controller/admin/user/attempts"
import { AdminUserCalendarController } from "../../../../src/controller/admin/user/calendar"
import { AdminUserDetailController } from "../../../../src/controller/admin/user/detail"
import { AdminUserListController } from "../../../../src/controller/admin/user/list"
import { UserStatsController } from "../../../../src/controller/user/stats"
import { env } from "../../../../src/env"
import { generateAccessToken } from "../../../../src/lib/jwt"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzleAuthAccountRepository } from "../../../../src/repository/drizzle/auth-account-repository"
import { DrizzleLearningRecordRepository } from "../../../../src/repository/drizzle/learning-record-repository"
import { DrizzleUserGoalRepository } from "../../../../src/repository/drizzle/user-goal-repository"
import { DrizzleUserRepository } from "../../../../src/repository/drizzle/user-repository"
import { DrizzleVocabularyRepository } from "../../../../src/repository/drizzle/vocabulary-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { userRouter } from "../../../../src/routes/user-router"
import { createSubmittedAttempt } from "../../../fixture/learning-record"
import { insertAttemptUser, insertGeneratedPassage } from "../../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const authAccountRepository = new DrizzleAuthAccountRepository(testDb)
const learningRecordRepository = new DrizzleLearningRecordRepository(testDb)
const userGoalRepository = new DrizzleUserGoalRepository(testDb)
const userRepository = new DrizzleUserRepository(testDb)
const vocabularyRepository = new DrizzleVocabularyRepository(testDb)

const app = createTestApp()

app.use(
  "/api/admin",
  adminRouter({
    user: {
      attempts: new AdminUserAttemptsController(learningRecordRepository, userRepository),
      calendar: new AdminUserCalendarController(learningRecordRepository, userRepository),
      detail: new AdminUserDetailController(authAccountRepository, learningRecordRepository, userGoalRepository, userRepository, vocabularyRepository),
      list: new AdminUserListController(userRepository),
    },
  }),
)
attachUnhandledExceptionHandler(app)

/**
 * 比べる相手のマイページの API（GET /api/user/stats）
 */
const userApp = createTestApp()
userApp.use("/api/user", userRouter({ stats: new UserStatsController(learningRecordRepository, userGoalRepository, userRepository) }))
attachUnhandledExceptionHandler(userApp)

/**
 * 問題を 1 回解いた、GitHub でログインしたユーザー
 */
const insertLearner = async () => {
  const user = await insertAttemptUser()
  await testDb.insert(authAccounts).values({ provider: "github", providerAccountId: `gh-${user.id}`, userId: user.id })
  const generated = await insertGeneratedPassage({ status: "published" })
  await createSubmittedAttempt({
    passageId: generated.passage.id,
    questionIds: generated.questions.map((question) => question.id),
    studyDate: "2026-10-12",
    userId: user.id,
  })
  return user
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/user", () => {
  describe("正常系", () => {
    it("ユーザーの一覧（解いた回数・最後に学習した日・ログイン方法つき）と全体の件数を返す", async () => {
      const user = await insertLearner()

      const res = await request(app).get("/api/admin/user").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        limit: 50,
        page: 1,
        total: 1,
        users: [
          {
            id: user.id,
            avatar_url: null,
            email: user.email,
            last_studied_date: "2026-10-12",
            name: "Attempt User",
            providers: ["github"],
            solved_attempts: 1,
            created_at: expect.any(String),
          },
        ],
      })
    })
  })

  describe("異常系", () => {
    it("X-Admin-Token が無いと 401", async () => {
      const res = await request(app).get("/api/admin/user")

      expect(res.status).toBe(401)
    })

    it.each([["sort=name"], ["page=0"], ["page=10001"], ["limit=101"]])("%s は 400", async (query) => {
      const res = await request(app).get(`/api/admin/user?${query}`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(400)
    })
  })
})

describe("GET /api/admin/user/:id", () => {
  describe("正常系", () => {
    it("基本の情報と、マイページ（GET /api/user/stats）と同じ学習のまとめ、単語帳の数を返す", async () => {
      const user = await insertLearner()
      const [res, userStats] = await Promise.all([
        request(app).get(`/api/admin/user/${user.id}`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN),
        request(userApp).get("/api/user/stats").set("Authorization", `Bearer ${generateAccessToken(user.id)}`),
      ])

      expect(res.status).toBe(200)
      expect(res.body.user).toEqual({
        id: user.id,
        avatar_url: null,
        email: user.email,
        last_studied_date: "2026-10-12",
        name: "Attempt User",
        providers: ["github"],
        timezone: "Asia/Tokyo",
        created_at: expect.any(String),
      })
      expect(res.body.stats).toEqual(userStats.body)
      expect(res.body.vocabulary).toEqual({ due_count: 0, learning_count: 0, mastered_count: 0, new_count: expect.any(Number), next_due_date: null })
    })
  })

  describe("異常系", () => {
    it("存在しないユーザーは 404", async () => {
      const res = await request(app).get("/api/admin/user/999999").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
    })
  })
})

describe("GET /api/admin/user/:id/calendar", () => {
  describe("正常系", () => {
    it("マイページと同じ形のカレンダーを返す", async () => {
      const user = await insertLearner()

      const res = await request(app).get(`/api/admin/user/${user.id}/calendar?from=2026-10-10&to=2026-10-12`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body.days.map((day: { attempt_count: number, date: string }) => [day.date, day.attempt_count])).toEqual([
        ["2026-10-10", 0],
        ["2026-10-11", 0],
        ["2026-10-12", 1],
      ])
    })
  })

  describe("異常系", () => {
    it("存在しないユーザーは 404（マイページの 401 にはしない）", async () => {
      const res = await request(app).get("/api/admin/user/999999/calendar").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
    })
  })
})

describe("GET /api/admin/user/:id/attempts", () => {
  describe("正常系", () => {
    it("マイページと同じ形の学習履歴を返す", async () => {
      const user = await insertLearner()

      const res = await request(app).get(`/api/admin/user/${user.id}/attempts?limit=5`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ attempts: [{ study_date: "2026-10-12" }], next_cursor: null })
    })
  })

  describe("異常系", () => {
    it("存在しないユーザーは 404（マイページの 401 にはしない）", async () => {
      const res = await request(app).get("/api/admin/user/999999/attempts").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
    })
  })
})
