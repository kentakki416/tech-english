import request from "supertest"

import { UserGetGoalController } from "../../../src/controller/user/get-goal"
import { DrizzleUserGoalRepository } from "../../../src/repository/drizzle/user-goal-repository"
import { userRouter } from "../../../src/routes/user-router"
import { insertUserGoal } from "../../fixture/learning-record"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const app = createTestApp()

app.use("/api/user", userRouter({ getGoal: new UserGetGoalController(new DrizzleUserGoalRepository(testDb)) }))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/user/goal", () => {
  describe("正常系", () => {
    it("目標があれば 200 で全項目を返す", async () => {
      const { token, user } = await createTestUser({ email: "learner@example.com" })
      const { user: otherUser } = await createTestUser({ email: "other@example.com" })
      await insertUserGoal(user.id, { goalText: "辞書なしで読む", targetDate: "2027-03-31", weeklyMetric: "minutes", weeklyTarget: 60 })
      await insertUserGoal(otherUser.id, { goalText: "他のユーザーの目標" })

      const res = await request(app).get("/api/user/goal").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        goal: {
          goal_text: "辞書なしで読む",
          target_date: "2027-03-31",
          weekly_metric: "minutes",
          weekly_target: 60,
        },
      })
    })

    it("目標が無ければ 200 で goal は null", async () => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/user/goal").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ goal: null })
    })
  })

  describe("異常系", () => {
    it("トークンがない場合、401 を返す", async () => {
      const res = await request(app).get("/api/user/goal")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
