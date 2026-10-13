import request from "supertest"

import { addDaysToDate, getWeekRange } from "@repo/domain"

import { UserStatsController } from "../../../src/controller/user/stats"
import { generateAccessToken } from "../../../src/lib/jwt"
import { DrizzleLearningRecordRepository } from "../../../src/repository/drizzle/learning-record-repository"
import { DrizzleUserGoalRepository } from "../../../src/repository/drizzle/user-goal-repository"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { createSubmittedAttempt, insertUserGoal } from "../../fixture/learning-record"
import { insertGeneratedPassage } from "../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const app = createTestApp()

app.use(
  "/api/user",
  userRouter({
    stats: new UserStatsController(
      new DrizzleLearningRecordRepository(testDb),
      new DrizzleUserGoalRepository(testDb),
      new DrizzleUserRepository(testDb),
    ),
  }),
)
attachUnhandledExceptionHandler(app)

/**
 * その時点のタイムゾーンでの日付（YYYY-MM-DD。sv-SE の日付の書式は ISO 8601 と同じ）
 */
const formatToday = (timeZone: string): string => new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date())

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/user/stats", () => {
  describe("正常系", () => {
    it("200 で連続学習日数・目標の進捗・累計・種類別の正答率・最近の挑戦を返す", async () => {
      const { token, user } = await createTestUser()
      const today = formatToday("Asia/Tokyo")
      const yesterday = addDaysToDate(today, -1)
      const { passage, questions } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-01T03:00:00.000Z"), status: "published" })
      const questionIds = questions.map((question) => question.id)
      /**
       * 設問は要旨・詳細・語義の順。今日の挑戦は単語の意味を使い、昨日の挑戦はアシストなし
       */
      const todayAttempt = await createSubmittedAttempt({
        correctness: [true, false, true],
        elapsedSeconds: 312,
        passageId: passage.id,
        questionIds,
        studyDate: today,
        submittedAt: new Date(`${yesterday}T23:14:00.000Z`),
        userId: user.id,
        wordLookupCount: 1,
      })
      const yesterdayAttempt = await createSubmittedAttempt({
        elapsedSeconds: 150,
        passageId: passage.id,
        questionIds,
        studyDate: yesterday,
        submittedAt: new Date(`${yesterday}T03:05:00.000Z`),
        userId: user.id,
      })
      await insertUserGoal(user.id, { targetDate: addDaysToDate(today, 30), weeklyMetric: "passages", weeklyTarget: 5 })
      const weekStart = getWeekRange(today).start
      const weeklyProgress = [today, yesterday].filter((date) => date >= weekStart).length

      const res = await request(app).get("/api/user/stats").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        goal: {
          days_left: 30,
          goal_text: "英語の公式ドキュメントを辞書なしで読めるようになる",
          is_weekly_achieved: false,
          target_date: addDaysToDate(today, 30),
          weekly_metric: "passages",
          weekly_progress: weeklyProgress,
          weekly_target: 5,
        },
        no_assist: { accuracy_percent: 100, correct_count: 3, question_count: 3 },
        recent_attempts: [
          {
            id: todayAttempt.id,
            correct_count: 2,
            elapsed_seconds: 312,
            is_overtime: false,
            passage_id: passage.id,
            question_count: 3,
            study_date: today,
            submitted_at: `${yesterday}T23:14:00.000Z`,
            submitted_time: "08:14",
            title: "Synchronizing with Effects",
            used_assist: true,
          },
          {
            id: yesterdayAttempt.id,
            correct_count: 3,
            elapsed_seconds: 150,
            is_overtime: false,
            passage_id: passage.id,
            question_count: 3,
            study_date: yesterday,
            submitted_at: `${yesterday}T03:05:00.000Z`,
            submitted_time: "12:05",
            title: "Synchronizing with Effects",
            used_assist: false,
          },
        ],
        streak: {
          current: 2,
          longest: 2,
          recent_days: Array.from({ length: 14 }, (_, index) => {
            const date = addDaysToDate(today, index - 13)
            return { date, has_studied: date === today || date === yesterday }
          }),
        },
        today,
        totals: {
          accuracy_percent: 83,
          attempt_count: 2,
          correct_count: 5,
          passage_count: 1,
          question_count: 6,
          study_seconds: 462,
        },
        type_accuracy: [
          { accuracy_percent: 100, correct_count: 2, question_count: 2, type: "main_idea" },
          { accuracy_percent: 50, correct_count: 1, question_count: 2, type: "detail" },
          { accuracy_percent: 100, correct_count: 2, question_count: 2, type: "vocabulary" },
          { accuracy_percent: null, correct_count: 0, question_count: 0, type: "inference" },
          { accuracy_percent: null, correct_count: 0, question_count: 0, type: "purpose" },
        ],
        weakest_question_type: "detail",
      })
    })

    it("まだ 1 問も解いていなければ、累計 0・正答率 null・目標 null・最近の挑戦なしで 200", async () => {
      const { token } = await createTestUser()
      const today = formatToday("Asia/Tokyo")

      const res = await request(app).get("/api/user/stats").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        goal: null,
        no_assist: { accuracy_percent: null, correct_count: 0, question_count: 0 },
        recent_attempts: [],
        streak: { current: 0, longest: 0, recent_days: expect.any(Array) },
        today,
        totals: { accuracy_percent: null, attempt_count: 0, correct_count: 0, passage_count: 0, question_count: 0, study_seconds: 0 },
        type_accuracy: expect.any(Array),
        weakest_question_type: null,
      })
      expect(res.body.streak.recent_days).toHaveLength(14)
      expect(res.body.type_accuracy).toHaveLength(5)
    })
  })

  describe("異常系", () => {
    it("トークンがない場合、401 を返す", async () => {
      const res = await request(app).get("/api/user/stats")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("ユーザーが存在しない場合（削除済みユーザーの access token）、401 を返す", async () => {
      const res = await request(app).get("/api/user/stats").set("Authorization", `Bearer ${generateAccessToken(999_999)}`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
