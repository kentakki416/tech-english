import request from "supertest"

import { addDaysToDate, countDaysBetween } from "@repo/domain"

import { UserCalendarController } from "../../../src/controller/user/calendar"
import { generateAccessToken } from "../../../src/lib/jwt"
import { DrizzleLearningRecordRepository } from "../../../src/repository/drizzle/learning-record-repository"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { createSubmittedAttempt } from "../../fixture/learning-record"
import { insertGeneratedPassage } from "../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const app = createTestApp()

app.use(
  "/api/user",
  userRouter({
    calendar: new UserCalendarController(new DrizzleLearningRecordRepository(testDb), new DrizzleUserRepository(testDb)),
  }),
)
attachUnhandledExceptionHandler(app)

/**
 * その時点のタイムゾーンでの日付（YYYY-MM-DD。sv-SE の日付の書式は ISO 8601 と同じ）
 */
const formatToday = (timeZone: string): string => new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date())

/**
 * 設問 3 問の問題と、その日の提出済みの挑戦（2 問正解・学習秒数 elapsedSeconds）を入れる
 */
const insertStudy = async (userId: number, studyDate: string, elapsedSeconds: number) => {
  const { passage, questions } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-01T03:00:00.000Z"), status: "published" })
  await createSubmittedAttempt({
    correctness: [true, true, false],
    elapsedSeconds,
    passageId: passage.id,
    questionIds: questions.map((question) => question.id),
    studyDate,
    userId,
  })
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/user/calendar", () => {
  describe("正常系", () => {
    it("期間を省略すると、今日までの年表示の範囲（365 か 366 日）の全日を返し、今日のマスに色の段階が付く", async () => {
      const { token, user } = await createTestUser()
      const today = formatToday("Asia/Tokyo")
      await insertStudy(user.id, today, 1000)

      const res = await request(app).get("/api/user/calendar").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ days: expect.any(Array), from: expect.any(String), to: today, today })
      const dayCount = countDaysBetween(res.body.from, res.body.to) + 1
      expect([365, 366]).toContain(dayCount)
      expect(res.body.days).toHaveLength(dayCount)
      expect(res.body.days[0].date).toBe(res.body.from)
      expect(res.body.days[dayCount - 1]).toEqual({
        attempt_count: 1,
        correct_count: 2,
        date: today,
        level: 3,
        question_count: 3,
        study_seconds: 1000,
      })
    })

    it("from〜to を指定すると、days の件数が範囲の日数と一致し、学習していない日は level 0", async () => {
      const { token, user } = await createTestUser()
      await insertStudy(user.id, "2026-10-01", 300)
      await insertStudy(user.id, "2026-10-31", 301)
      await insertStudy(user.id, "2026-11-01", 1801)

      const res = await request(app)
        .get("/api/user/calendar")
        .query({ from: "2026-10-01", to: "2026-10-31" })
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ days: expect.any(Array), from: "2026-10-01", to: "2026-10-31", today: formatToday("Asia/Tokyo") })
      expect(res.body.days).toHaveLength(31)
      expect(res.body.days[0]).toEqual({
        attempt_count: 1,
        correct_count: 2,
        date: "2026-10-01",
        level: 1,
        question_count: 3,
        study_seconds: 300,
      })
      expect(res.body.days[1]).toEqual({
        attempt_count: 0,
        correct_count: 0,
        date: "2026-10-02",
        level: 0,
        question_count: 0,
        study_seconds: 0,
      })
      expect(res.body.days[30]).toMatchObject({ date: "2026-10-31", level: 2, study_seconds: 301 })
    })

    it("期間が 366 日（上限ちょうど）なら 200", async () => {
      const { token } = await createTestUser()
      const to = "2026-10-11"
      const from = addDaysToDate(to, -365)

      const res = await request(app).get("/api/user/calendar").query({ from, to }).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.days).toHaveLength(366)
    })
  })

  describe("異常系", () => {
    it.each([
      ["存在しない日付（2026-02-30）", { from: "2026-02-30", to: "2026-03-31" }],
      ["日付の形式でない", { from: "2026/10/01", to: "2026-10-31" }],
      ["期間が 367 日", { from: "2025-10-10", to: "2026-10-11" }],
      ["from が to より後", { from: "2026-10-12", to: "2026-10-11" }],
      ["from だけ", { from: "2026-10-01" }],
    ])("%s は 400", async (_label, query) => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/user/calendar").query(query).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("トークンがない場合、401 を返す", async () => {
      const res = await request(app).get("/api/user/calendar")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("ユーザーが存在しない場合（削除済みユーザーの access token）、401 を返す", async () => {
      const res = await request(app).get("/api/user/calendar").set("Authorization", `Bearer ${generateAccessToken(999_999)}`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
