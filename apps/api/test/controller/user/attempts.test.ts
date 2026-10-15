import request from "supertest"

import { UserAttemptsController } from "../../../src/controller/user/attempts"
import { generateAccessToken } from "../../../src/lib/jwt"
import { DrizzleLearningRecordRepository } from "../../../src/repository/drizzle/learning-record-repository"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { createSubmittedAttempt } from "../../fixture/learning-record"
import { insertGeneratedPassage, insertReadingAttempt } from "../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const app = createTestApp()

app.use(
  "/api/user",
  userRouter({
    attempts: new UserAttemptsController(new DrizzleLearningRecordRepository(testDb), new DrizzleUserRepository(testDb)),
  }),
)
attachUnhandledExceptionHandler(app)

/**
 * ログインしたユーザーの提出済みの挑戦を、2026-10-09 に 1 件・2026-10-10 に 3 件入れる（他のユーザーの挑戦と挑戦中も入れる）
 */
const setupAttempts = async () => {
  const { token, user } = await createTestUser({ email: "learner@example.com" })
  const { user: otherUser } = await createTestUser({ email: "other@example.com" })
  const { passage, questions } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-01T03:00:00.000Z"), status: "published" })
  const base = { passageId: passage.id, questionIds: questions.map((question) => question.id), userId: user.id }
  const previousDay = await createSubmittedAttempt({ ...base, studyDate: "2026-10-09", submittedAt: new Date("2026-10-09T13:41:00.000Z") })
  const morning = await createSubmittedAttempt({
    ...base,
    correctness: [true, false, true],
    elapsedSeconds: 402,
    isOvertime: true,
    studyDate: "2026-10-10",
    submittedAt: new Date("2026-10-09T22:58:30.000Z"),
    translatedBlockCount: 2,
  })
  const noon = await createSubmittedAttempt({ ...base, studyDate: "2026-10-10", submittedAt: new Date("2026-10-10T03:00:00.000Z") })
  const evening = await createSubmittedAttempt({ ...base, studyDate: "2026-10-10", submittedAt: new Date("2026-10-10T11:00:00.000Z") })
  await createSubmittedAttempt({ ...base, studyDate: "2026-10-10", userId: otherUser.id })
  await insertReadingAttempt(passage.id, { startedAt: new Date("2026-10-10T12:00:00.000Z"), userId: user.id })
  return { evening, morning, noon, passage, previousDay, token }
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/user/attempts", () => {
  describe("正常系", () => {
    it("date を指定するとその日の自分の提出した挑戦だけを新しい順に返す", async () => {
      const { evening, morning, noon, passage, token } = await setupAttempts()

      const res = await request(app).get("/api/user/attempts").query({ date: "2026-10-10" }).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ attempts: expect.any(Array), next_cursor: null })
      expect(res.body.attempts.map((attempt: { id: number }) => attempt.id)).toEqual([evening.id, noon.id, morning.id])
      expect(res.body.attempts[2]).toEqual({
        id: morning.id,
        correct_count: 2,
        elapsed_seconds: 402,
        is_overtime: true,
        passage_id: passage.id,
        question_count: 3,
        study_date: "2026-10-10",
        submitted_at: "2026-10-09T22:58:30.000Z",
        submitted_time: "07:58",
        title: "Synchronizing with Effects",
        used_assist: true,
      })
    })

    it("読み上げだけを使った挑戦は used_assist が true、どのアシストも使っていなければ false", async () => {
      const { token, user } = await createTestUser()
      const { passage, questions } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-01T03:00:00.000Z"), status: "published" })
      const base = { passageId: passage.id, questionIds: questions.map((question) => question.id), studyDate: "2026-10-10", userId: user.id }
      const listenedOnly = await createSubmittedAttempt({ ...base, listenedBlockCount: 1, submittedAt: new Date("2026-10-10T04:00:00.000Z") })
      const noAssist = await createSubmittedAttempt({ ...base, submittedAt: new Date("2026-10-10T03:00:00.000Z") })

      const res = await request(app).get("/api/user/attempts").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.attempts.map((attempt: { id: number; used_assist: boolean }) => [attempt.id, attempt.used_assist])).toEqual([
        [listenedOnly.id, true],
        [noAssist.id, false],
      ])
    })

    it("limit 件ずつ返し、next_cursor で 2 ページ目が取れる。最後のページの next_cursor は null", async () => {
      const { evening, morning, noon, previousDay, token } = await setupAttempts()

      const firstPage = await request(app).get("/api/user/attempts").query({ limit: 2 }).set("Authorization", `Bearer ${token}`)
      const secondPage = await request(app)
        .get("/api/user/attempts")
        .query({ cursor: firstPage.body.next_cursor, limit: 2 })
        .set("Authorization", `Bearer ${token}`)

      expect(firstPage.status).toBe(200)
      expect(firstPage.body.attempts.map((attempt: { id: number }) => attempt.id)).toEqual([evening.id, noon.id])
      expect(firstPage.body.next_cursor).toBe(noon.id)
      expect(secondPage.status).toBe(200)
      expect(secondPage.body.attempts.map((attempt: { id: number }) => attempt.id)).toEqual([morning.id, previousDay.id])
      expect(secondPage.body.next_cursor).toBeNull()
    })

    it("limit を省略すると 20 件まで返す", async () => {
      const { token } = await setupAttempts()

      const res = await request(app).get("/api/user/attempts").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.attempts).toHaveLength(4)
      expect(res.body.next_cursor).toBeNull()
    })
  })

  describe("異常系", () => {
    it.each([
      ["limit が 51（上限 + 1）", { limit: 51 }],
      ["limit が 0", { limit: 0 }],
      ["存在しない日付", { date: "2026-02-30" }],
      ["cursor が数でない", { cursor: "abc" }],
      ["cursor が DB の integer の上限を超える", { cursor: "2147483648" }],
    ])("%s は 400", async (_label, query) => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/user/attempts").query(query).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })

    it("トークンがない場合、401 を返す", async () => {
      const res = await request(app).get("/api/user/attempts")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("ユーザーが存在しない場合（削除済みユーザーの access token）、401 を返す", async () => {
      const res = await request(app).get("/api/user/attempts").set("Authorization", `Bearer ${generateAccessToken(999_999)}`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
