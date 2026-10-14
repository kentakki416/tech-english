import request from "supertest"

import { UserGetReminderController } from "../../../src/controller/user/get-reminder"
import { UserPutReminderController } from "../../../src/controller/user/put-reminder"
import { DrizzleReminderSettingRepository } from "../../../src/repository/drizzle/reminder-setting-repository"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { insertReminderSetting } from "../../fixture/reminder"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const app = createTestApp()

const reminderSettingRepository = new DrizzleReminderSettingRepository(testDb)

app.use(
  "/api/user",
  userRouter({
    getReminder: new UserGetReminderController(reminderSettingRepository),
    putReminder: new UserPutReminderController(reminderSettingRepository, new DrizzleUserRepository(testDb)),
  }),
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

describe("GET /api/user/reminder", () => {
  describe("正常系", () => {
    it("未保存なら 200 で既定値（オフ・毎日・21:00）を返す。他のユーザーの設定は返さない", async () => {
      const { token } = await createTestUser({ email: "learner@example.com" })
      const { user: otherUser } = await createTestUser({ email: "other@example.com" })
      await insertReminderSetting(otherUser.id, { time: "07:00", weekdays: [1] })

      const res = await request(app).get("/api/user/reminder").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ is_enabled: false, time: "21:00", weekdays: [1, 2, 3, 4, 5, 6, 7] })
    })

    it("PUT した後の GET は保存した値を返す", async () => {
      const { token } = await createTestUser()
      await request(app)
        .put("/api/user/reminder")
        .set("Authorization", `Bearer ${token}`)
        .send({ is_enabled: true, time: "07:45", weekdays: [5, 1, 3] })

      const res = await request(app).get("/api/user/reminder").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ is_enabled: true, time: "07:45", weekdays: [1, 3, 5] })
    })

    it("オフで保存した設定も曜日と時刻を保持して返す", async () => {
      const { token, user } = await createTestUser()
      await insertReminderSetting(user.id, { isEnabled: false, time: "06:30", weekdays: [6, 7] })

      const res = await request(app).get("/api/user/reminder").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ is_enabled: false, time: "06:30", weekdays: [6, 7] })
    })
  })

  describe("異常系", () => {
    it("トークンがない場合、401 を返す", async () => {
      const res = await request(app).get("/api/user/reminder")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("無効なトークンの場合、401 を返す", async () => {
      const res = await request(app).get("/api/user/reminder").set("Authorization", "Bearer invalid-token")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it.each([
      ["time が 15 分刻みでない", { time: "21:10" }],
      ["weekdays に 8（上限 + 1）", { weekdays: [8] }],
    ])("DB に契約外の値（%s）があれば、そのまま返さずに 500 を返す（レスポンスの検証）", async (_, overrides) => {
      const { token, user } = await createTestUser()
      await insertReminderSetting(user.id, overrides)

      const res = await request(app).get("/api/user/reminder").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 500 })
    })
  })
})
