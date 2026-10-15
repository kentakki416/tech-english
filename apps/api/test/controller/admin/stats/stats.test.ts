import request from "supertest"

import { users } from "@repo/db"

import { AdminStatsOverviewController } from "../../../../src/controller/admin/stats/overview"
import { AdminPassageStatsDetailController } from "../../../../src/controller/admin/stats/passage-detail"
import { AdminPassageStatsListController } from "../../../../src/controller/admin/stats/passage-list"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzleAdminStatsRepository } from "../../../../src/repository/drizzle/admin-stats-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { createSubmittedAttempt } from "../../../fixture/learning-record"
import { insertGeneratedPassage } from "../../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const adminStatsRepository = new DrizzleAdminStatsRepository(testDb)

const app = createTestApp()

app.use(
  "/api/admin",
  adminRouter({
    stats: {
      overview: new AdminStatsOverviewController(adminStatsRepository),
      passageDetail: new AdminPassageStatsDetailController(adminStatsRepository),
      passageList: new AdminPassageStatsListController(adminStatsRepository),
    },
  }),
)
attachUnhandledExceptionHandler(app)

/**
 * 1 時間前に提出した挑戦つきの公開中の問題（Q1 で 0 を選んで不正解、ほかは正解）。ユーザーは 2 時間前に登録した
 * （DB の now() と API の new Date() の時計のずれで、登録が期間の終わりより後にならないよう、登録日時を明示する）
 */
const insertSolvedPassage = async () => {
  const generated = await insertGeneratedPassage({ publishedAt: new Date("2026-10-01T03:00:00.000Z"), status: "published" })
  const [user] = await testDb
    .insert(users)
    .values({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), email: "stats-learner@example.com", name: "Learner" })
    .returning()
  const questionIds = generated.questions.map((question) => question.id)
  await createSubmittedAttempt({
    correctness: [false, true, true],
    elapsedSeconds: 120,
    passageId: generated.passage.id,
    questionIds,
    studyDate: "2026-10-15",
    submittedAt: new Date(Date.now() - 60 * 60 * 1000),
    userId: user.id,
  })
  return { passageId: generated.passage.id, questionIds }
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/stats/overview", () => {
  describe("正常系", () => {
    it("period を省くと直近 30 日で、数字と日ごとの 30 点の推移を返す", async () => {
      await insertSolvedPassage()

      const res = await request(app).get("/api/admin/stats/overview").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        active_users: 1,
        assist_rates: { listened: 0, looked_up: 0, translated: 0 },
        correct_rate: 2 / 3,
        from: expect.any(String),
        new_users: 1,
        period: "30d",
        series: { bucket: "day", points: expect.any(Array) },
        solved_attempts: 1,
        solved_users: 1,
        to: expect.any(String),
        total_users: 1,
      })
      expect(res.body.series.points).toHaveLength(30)
    })

    it("period=all は週ごとの推移", async () => {
      await insertSolvedPassage()

      const res = await request(app).get("/api/admin/stats/overview?period=all").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ period: "all", series: { bucket: "week" } })
    })
  })

  describe("異常系", () => {
    it("X-Admin-Token が無いと 401", async () => {
      const res = await request(app).get("/api/admin/stats/overview")

      expect(res.status).toBe(401)
    })

    it("period が不正なら 400", async () => {
      const res = await request(app).get("/api/admin/stats/overview?period=1y").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(400)
    })
  })
})

describe("GET /api/admin/stats/passage", () => {
  describe("正常系", () => {
    it("問題ごとの成績を返す（公開日時は ISO 8601）", async () => {
      const { passageId } = await insertSolvedPassage()

      const res = await request(app).get("/api/admin/stats/passage?sort=correct_rate&order=asc").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        limit: 50,
        page: 1,
        passages: [
          {
            id: passageId,
            assist_rates: { listened: 0, looked_up: 0, translated: 0 },
            average_elapsed_seconds: 120,
            correct_rate: 2 / 3,
            difficulty: 2,
            overtime_rate: 0,
            published_at: "2026-10-01T03:00:00.000Z",
            solved_attempts: 1,
            solved_users: 1,
            source: { id: expect.any(Number), name: "React 公式ドキュメント" },
            status: "published",
            time_limit_seconds: 180,
            title: "Synchronizing with Effects",
          },
        ],
        total: 1,
      })
    })
  })

  describe("異常系", () => {
    it.each([["sort=title"], ["page=0"], ["page=10001"], ["page=1e300"], ["limit=101"], ["order=up"]])("%s は 400", async (query) => {
      const res = await request(app).get(`/api/admin/stats/passage?${query}`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(400)
    })
  })
})

describe("GET /api/admin/stats/passage/:id", () => {
  describe("正常系", () => {
    it("設問ごとの正答率・選択肢の割合・要確認の印を返す", async () => {
      const { passageId, questionIds } = await insertSolvedPassage()

      const res = await request(app).get(`/api/admin/stats/passage/${passageId}?period=7d`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        passage: {
          id: passageId,
          assist_rates: { listened: 0, looked_up: 0, translated: 0 },
          average_elapsed_seconds: 120,
          correct_rate: 2 / 3,
          difficulty: 2,
          overtime_rate: 0,
          published_at: "2026-10-01T03:00:00.000Z",
          solved_attempts: 1,
          solved_users: 1,
          source: { id: expect.any(Number), name: "React 公式ドキュメント" },
          status: "published",
          time_limit_seconds: 180,
          title: "Synchronizing with Effects",
        },
        period: "7d",
        questions: questionIds.map((id, index) => ({
          id,
          answer_count: 1,
          choice_rates: expect.any(Array),
          choices: expect.any(Array),
          correct_choice_index: expect.any(Number),
          correct_rate: index === 0 ? 0 : 1,
          misleading_choice_indexes: [],
          needs_review: false,
          order_index: index,
          prompt: expect.any(String),
          type: expect.any(String),
          unanswered_rate: 0,
        })),
      })
      expect(res.body.questions[0].choice_rates).toEqual([1, 0, 0, 0])
    })

    it("期間内に解かれていない問題も 200 で、数は 0・比率は null", async () => {
      const generated = await insertGeneratedPassage({ publishedAt: new Date("2026-10-01T03:00:00.000Z"), status: "published" })

      const res = await request(app).get(`/api/admin/stats/passage/${generated.passage.id}`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body.passage).toMatchObject({ average_elapsed_seconds: null, correct_rate: null, solved_attempts: 0, solved_users: 0 })
      expect(res.body.questions[0]).toMatchObject({ answer_count: 0, choice_rates: [null, null, null, null], correct_rate: null, misleading_choice_indexes: [], needs_review: false })
    })
  })

  describe("異常系", () => {
    it("存在しない問題は 404", async () => {
      const res = await request(app).get("/api/admin/stats/passage/999999").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
    })

    it("id が数でなければ 400", async () => {
      const res = await request(app).get("/api/admin/stats/passage/abc").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(400)
    })
  })
})
