import request from "supertest"

import { reminderSettings } from "@repo/db"

import { UserPutReminderController } from "../../../src/controller/user/put-reminder"
import { generateAccessToken } from "../../../src/lib/jwt"
import { DrizzleReminderSettingRepository } from "../../../src/repository/drizzle/reminder-setting-repository"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { insertReminderSetting, selectReminderSettingRows } from "../../fixture/reminder"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const app = createTestApp()

app.use(
  "/api/user",
  userRouter({
    putReminder: new UserPutReminderController(new DrizzleReminderSettingRepository(testDb), new DrizzleUserRepository(testDb)),
  }),
)
attachUnhandledExceptionHandler(app)

const VALID_BODY = {
  is_enabled: true,
  time: "21:15",
  weekdays: [1, 3, 5],
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("PUT /api/user/reminder", () => {
  describe("正常系", () => {
    it("初回は 200 で保存後の値を返し、reminder_settings に 1 行できる", async () => {
      const { token, user } = await createTestUser()

      const res = await request(app).put("/api/user/reminder").set("Authorization", `Bearer ${token}`).send(VALID_BODY)

      expect(res.status).toBe(200)
      expect(res.body).toEqual(VALID_BODY)
      const rows = await selectReminderSettingRows(user.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ isEnabled: true, time: "21:15:00", userId: user.id, weekdays: [1, 3, 5] })
    })

    it("2 回目は同じ行を上書きし、行は 1 つのまま（オフにしても曜日と時刻を保存する）", async () => {
      const { token, user } = await createTestUser()
      await request(app).put("/api/user/reminder").set("Authorization", `Bearer ${token}`).send(VALID_BODY)
      const [first] = await selectReminderSettingRows(user.id)
      const body = { is_enabled: false, time: "07:00", weekdays: [6, 7] }

      const res = await request(app).put("/api/user/reminder").set("Authorization", `Bearer ${token}`).send(body)

      expect(res.status).toBe(200)
      expect(res.body).toEqual(body)
      const rows = await selectReminderSettingRows(user.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: first.id, isEnabled: false, time: "07:00:00", weekdays: [6, 7] })
    })

    it("weekdays は昇順に並べて保存し、返す（[7, 1] → [1, 7]）", async () => {
      const { token, user } = await createTestUser()

      const res = await request(app)
        .put("/api/user/reminder")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...VALID_BODY, weekdays: [7, 1] })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ...VALID_BODY, weekdays: [1, 7] })
      expect((await selectReminderSettingRows(user.id))[0]).toMatchObject({ weekdays: [1, 7] })
    })

    it.each([
      ["time が 00:00（下限）", { time: "00:00" }],
      ["time が 23:45（上限）", { time: "23:45" }],
      ["weekdays が 1 つだけ", { weekdays: [4] }],
      ["weekdays が 7 つ全部", { weekdays: [1, 2, 3, 4, 5, 6, 7] }],
    ])("%s は 200", async (_label, overrides) => {
      const { token, user } = await createTestUser()

      const res = await request(app)
        .put("/api/user/reminder")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...VALID_BODY, ...overrides })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ...VALID_BODY, ...overrides })
      expect(await selectReminderSettingRows(user.id)).toHaveLength(1)
    })
  })

  describe("異常系", () => {
    it.each([
      ["weekdays が空", { weekdays: [] }],
      ["weekdays に 0（下限 − 1）", { weekdays: [0] }],
      ["weekdays に 8（上限 + 1）", { weekdays: [8] }],
      ["weekdays が重複", { weekdays: [1, 1] }],
      ["weekdays が整数でない", { weekdays: [1.5] }],
      ["time が 15 分刻みでない", { time: "21:10" }],
      ["time が 24:00", { time: "24:00" }],
      ["time の時が 1 桁", { time: "9:00" }],
      ["time が秒付き", { time: "21:00:00" }],
      ["is_enabled が boolean でない", { is_enabled: "true" }],
    ])("%s は 400 で、保存済みの設定を変えない", async (_label, overrides) => {
      const { token, user } = await createTestUser()
      await insertReminderSetting(user.id, { isEnabled: false, time: "07:00", weekdays: [6, 7] })
      const before = await selectReminderSettingRows(user.id)

      const res = await request(app)
        .put("/api/user/reminder")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...VALID_BODY, ...overrides })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(await selectReminderSettingRows(user.id)).toEqual(before)
    })

    it.each(["is_enabled", "time", "weekdays"])("項目 %s が欠けていると 400 で、行を作らない", async (key) => {
      const { token, user } = await createTestUser()
      const body: Record<string, unknown> = { ...VALID_BODY }
      delete body[key]

      const res = await request(app).put("/api/user/reminder").set("Authorization", `Bearer ${token}`).send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(await selectReminderSettingRows(user.id)).toHaveLength(0)
    })

    it("トークンがない場合、401 を返す", async () => {
      const res = await request(app).put("/api/user/reminder").send(VALID_BODY)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("ユーザーが存在しない場合（削除済みユーザーの access token）、401 を返し、DB に行を作らない", async () => {
      const res = await request(app)
        .put("/api/user/reminder")
        .set("Authorization", `Bearer ${generateAccessToken(999_999)}`)
        .send(VALID_BODY)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await testDb.$count(reminderSettings)).toBe(0)
    })
  })
})
