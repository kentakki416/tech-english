import request from "supertest"

import { eq, userGoals } from "@repo/db"

import { UserPutGoalController } from "../../../src/controller/user/put-goal"
import { generateAccessToken } from "../../../src/lib/jwt"
import { DrizzleUserGoalRepository } from "../../../src/repository/drizzle/user-goal-repository"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const app = createTestApp()

app.use(
  "/api/user",
  userRouter({ putGoal: new UserPutGoalController(new DrizzleUserGoalRepository(testDb), new DrizzleUserRepository(testDb)) }),
)
attachUnhandledExceptionHandler(app)

const VALID_BODY = {
  goal_text: "英語の公式ドキュメントを辞書なしで読めるようになる",
  target_date: "2027-03-31",
  weekly_metric: "passages",
  weekly_target: 5,
}

const selectGoalRows = async (userId: number) => testDb.select().from(userGoals).where(eq(userGoals.userId, userId))

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("PUT /api/user/goal", () => {
  describe("正常系", () => {
    it("200 で保存後の値を返し、user_goals に 1 行できる", async () => {
      const { token, user } = await createTestUser()

      const res = await request(app).put("/api/user/goal").set("Authorization", `Bearer ${token}`).send(VALID_BODY)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ goal: VALID_BODY })
      const rows = await selectGoalRows(user.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        goalText: VALID_BODY.goal_text,
        targetDate: "2027-03-31",
        userId: user.id,
        weeklyMetric: "passages",
        weeklyTarget: 5,
      })
    })

    it("2 回目の PUT は同じ行を上書きし、行は 1 つのまま", async () => {
      const { token, user } = await createTestUser()
      await request(app).put("/api/user/goal").set("Authorization", `Bearer ${token}`).send(VALID_BODY)
      const [first] = await selectGoalRows(user.id)
      const body = { goal_text: "毎朝 1 問", target_date: null, weekly_metric: "minutes", weekly_target: 60 }

      const res = await request(app).put("/api/user/goal").set("Authorization", `Bearer ${token}`).send(body)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ goal: body })
      const rows = await selectGoalRows(user.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: first.id, goalText: "毎朝 1 問", targetDate: null, weeklyMetric: "minutes", weeklyTarget: 60 })
    })

    it("すべて null で 200", async () => {
      const { token, user } = await createTestUser()
      const body = { goal_text: null, target_date: null, weekly_metric: null, weekly_target: null }

      const res = await request(app).put("/api/user/goal").set("Authorization", `Bearer ${token}`).send(body)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ goal: body })
      expect(await selectGoalRows(user.id)).toHaveLength(1)
    })

    it("goal_text の前後の空白を除いて保存する", async () => {
      const { token, user } = await createTestUser()

      const res = await request(app)
        .put("/api/user/goal")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...VALID_BODY, goal_text: "  辞書なしで読む\n" })

      expect(res.status).toBe(200)
      expect(res.body.goal.goal_text).toBe("辞書なしで読む")
      expect((await selectGoalRows(user.id))[0]).toMatchObject({ goalText: "辞書なしで読む" })
    })

    it.each([
      ["goal_text が 200 文字（上限ちょうど）", { goal_text: "あ".repeat(200) }],
      ["weekly_target が 1（下限ちょうど）", { weekly_target: 1 }],
      ["weekly_target が 10080（1 週間の分数。上限ちょうど）", { weekly_metric: "minutes", weekly_target: 10_080 }],
      ["target_date が過去の日付", { target_date: "2020-01-01" }],
      ["target_date がうるう日", { target_date: "2028-02-29" }],
    ])("%s は 200", async (_label, overrides) => {
      const { token } = await createTestUser()

      const res = await request(app).put("/api/user/goal").set("Authorization", `Bearer ${token}`).send({ ...VALID_BODY, ...overrides })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ goal: { ...VALID_BODY, ...overrides } })
    })
  })

  describe("異常系", () => {
    it.each([
      ["goal_text が 201 文字（上限 + 1）", { goal_text: "あ".repeat(201) }],
      ["goal_text が空文字", { goal_text: "" }],
      ["goal_text が空白だけ", { goal_text: "   " }],
      ["weekly_target が 0（下限 − 1）", { weekly_target: 0 }],
      ["weekly_target が 10081（上限 + 1）", { weekly_metric: "minutes", weekly_target: 10_081 }],
      ["weekly_target が整数でない", { weekly_target: 1.5 }],
      ["週の目標の指標だけ", { weekly_metric: "passages", weekly_target: null }],
      ["週の目標の値だけ", { weekly_metric: null, weekly_target: 5 }],
      ["weekly_metric が GOAL_METRICS に無い値", { weekly_metric: "hours" }],
      ["target_date が存在しない日付", { target_date: "2026-02-30" }],
      ["target_date がうるう年でない年の 2 月 29 日", { target_date: "2027-02-29" }],
      ["target_date が日付の形式でない", { target_date: "2027/03/31" }],
    ])("%s は 400 で、行を作らない", async (_label, overrides) => {
      const { token, user } = await createTestUser()

      const res = await request(app).put("/api/user/goal").set("Authorization", `Bearer ${token}`).send({ ...VALID_BODY, ...overrides })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(await selectGoalRows(user.id)).toHaveLength(0)
    })

    it.each(["goal_text", "target_date", "weekly_metric", "weekly_target"])("項目 %s が欠けていると 400", async (key) => {
      const { token, user } = await createTestUser()
      const body: Record<string, unknown> = { ...VALID_BODY }
      delete body[key]

      const res = await request(app).put("/api/user/goal").set("Authorization", `Bearer ${token}`).send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(await selectGoalRows(user.id)).toHaveLength(0)
    })

    it("トークンがない場合、401 を返す", async () => {
      const res = await request(app).put("/api/user/goal").send(VALID_BODY)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("ユーザーが存在しない場合（削除済みユーザーの access token）、401 を返し、DB に行を作らない", async () => {
      const res = await request(app)
        .put("/api/user/goal")
        .set("Authorization", `Bearer ${generateAccessToken(999_999)}`)
        .send(VALID_BODY)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await testDb.$count(userGoals)).toBe(0)
    })
  })
})
