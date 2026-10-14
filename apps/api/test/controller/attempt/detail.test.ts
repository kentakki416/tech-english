import request from "supertest"

import { eq, questions as questionsTable, readingAttempts } from "@repo/db"

import { AttemptDetailController } from "../../../src/controller/attempt/detail"
import { AttemptStartController } from "../../../src/controller/attempt/start"
import { AttemptSubmitController } from "../../../src/controller/attempt/submit"
import { DrizzlePassageRepository } from "../../../src/repository/drizzle/passage-repository"
import { DrizzleReadingAttemptRepository } from "../../../src/repository/drizzle/reading-attempt-repository"
import { DrizzleTransactionRunner } from "../../../src/repository/drizzle/transaction-runner"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { attemptRouter } from "../../../src/routes/attempt-router"
import { passageRouter } from "../../../src/routes/passage-router"
import { insertGeneratedPassage, insertReadingAttempt } from "../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const passageRepository = new DrizzlePassageRepository(testDb)
const readingAttemptRepository = new DrizzleReadingAttemptRepository(testDb)
const userRepository = new DrizzleUserRepository(testDb)
const transactionRunner = new DrizzleTransactionRunner(testDb)

const app = createTestApp()

app.use(
  "/api/passage",
  passageRouter({ start: new AttemptStartController(passageRepository, readingAttemptRepository, userRepository) }),
)
app.use(
  "/api/attempt",
  attemptRouter({
    detail: new AttemptDetailController(passageRepository, readingAttemptRepository),
    submit: new AttemptSubmitController(passageRepository, readingAttemptRepository, transactionRunner, userRepository),
  }),
)
attachUnhandledExceptionHandler(app)

const DAY_MS = 24 * 60 * 60 * 1000

const insertPublishedGeneratedPassage = async () =>
  insertGeneratedPassage({ publishedAt: new Date("2026-10-12T03:00:00.000Z"), status: "published" })

const selectAttempt = async (id: number) => {
  const [row] = await testDb.select().from(readingAttempts).where(eq(readingAttempts.id, id))
  return row
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/attempt/:id", () => {
  describe("正常系", () => {
    it("挑戦中は開始時と同じ形を返す", async () => {
      const { passage } = await insertPublishedGeneratedPassage()
      const { token } = await createTestUser()
      const started = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      const res = await request(app).get(`/api/attempt/${started.body.id}`).set("Authorization", `Bearer ${token}`)

      expect(started.status).toBe(201)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ...started.body, server_now: expect.any(String) })
    })

    it("開始から 24 時間たった挑戦中は expired に更新して期限切れの形を返す（境界値）", async () => {
      const { passage } = await insertPublishedGeneratedPassage()
      const { token, user } = await createTestUser()
      const startedAt = new Date(Date.now() - DAY_MS)
      const attempt = await insertReadingAttempt(passage.id, { startedAt, userId: user.id })

      const res = await request(app).get(`/api/attempt/${attempt.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: attempt.id,
        passage: { id: passage.id, difficulty: 2, title: "Synchronizing with Effects", word_count: 60 },
        started_at: startedAt.toISOString(),
        status: "expired",
      })
      expect(await selectAttempt(attempt.id)).toMatchObject({ status: "expired" })
    })

    it("開始から 23:59:59 の挑戦中は挑戦中の形を返し、DB も変えない（境界値）", async () => {
      const { passage } = await insertPublishedGeneratedPassage()
      const { token, user } = await createTestUser()
      const attempt = await insertReadingAttempt(passage.id, { startedAt: new Date(Date.now() - DAY_MS + 1000), userId: user.id })

      const res = await request(app).get(`/api/attempt/${attempt.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.status).toBe("in_progress")
      expect(await selectAttempt(attempt.id)).toMatchObject({ status: "in_progress" })
    })

    it("提出済みの挑戦は提出のレスポンスと同じ結果の形を返し、用語集に語義設問の対象語句（escape hatch）も含む", async () => {
      const { glossary, passage, questions } = await insertPublishedGeneratedPassage()
      const { token } = await createTestUser()
      const started = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)
      const submitted = await request(app)
        .post(`/api/attempt/${started.body.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          active_seconds: 0,
          answers: [{ question_id: questions[2].id, selected_choice_index: 1 }],
          translated_block_count: 1,
          word_lookups: [{ glossary_entry_id: glossary[0].id, lemma: "stay in sync with", source: "glossary", surface: "stay in sync with" }],
        })

      const res = await request(app).get(`/api/attempt/${started.body.id}`).set("Authorization", `Bearer ${token}`)

      expect(submitted.status).toBe(200)
      expect(res.status).toBe(200)
      expect(res.body).toEqual(submitted.body)
      expect(res.body).toMatchObject({ correct_count: 1, status: "submitted", words_per_minute: null })
      expect(res.body.glossary.map((entry: { id: number }) => entry.id)).toEqual(glossary.map((entry) => entry.id))
      expect(started.body.glossary.map((entry: { id: number }) => entry.id)).not.toContain(glossary[1]?.id)
    })

    it("提出後に正解が直された設問は、正誤を提出時のまま is_answer_key_changed を true にする", async () => {
      const { passage, questions } = await insertPublishedGeneratedPassage()
      const { token } = await createTestUser()
      const started = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)
      await request(app)
        .post(`/api/attempt/${started.body.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          active_seconds: 0,
          answers: [
            { question_id: questions[0].id, selected_choice_index: 0 },
            { question_id: questions[2].id, selected_choice_index: 1 },
          ],
          translated_block_count: 0,
          word_lookups: [],
        })
      /**
       * 不正解だった 1 問目の正解を選んだ 0 に、正解だった 3 問目の正解を 2 に直す（2 問目は未回答のまま）
       */
      await testDb.update(questionsTable).set({ correctChoiceIndex: 0 }).where(eq(questionsTable.id, questions[0].id))
      await testDb.update(questionsTable).set({ correctChoiceIndex: 2 }).where(eq(questionsTable.id, questions[2].id))

      const res = await request(app).get(`/api/attempt/${started.body.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.correct_count).toBe(1)
      expect(
        res.body.questions.map((question: Record<string, unknown>) => ({
          correct_choice_index: question.correct_choice_index,
          is_answer_key_changed: question.is_answer_key_changed,
          is_correct: question.is_correct,
          selected_choice_index: question.selected_choice_index,
        })),
      ).toEqual([
        { correct_choice_index: 0, is_answer_key_changed: true, is_correct: false, selected_choice_index: 0 },
        { correct_choice_index: 2, is_answer_key_changed: false, is_correct: false, selected_choice_index: null },
        { correct_choice_index: 2, is_answer_key_changed: true, is_correct: true, selected_choice_index: 1 },
      ])
    })

    it("期限切れの挑戦は期限切れの形を返す", async () => {
      const { passage } = await insertPublishedGeneratedPassage()
      const { token, user } = await createTestUser()
      const attempt = await insertReadingAttempt(passage.id, {
        startedAt: new Date("2026-10-01T00:00:00.000Z"),
        status: "expired",
        userId: user.id,
      })

      const res = await request(app).get(`/api/attempt/${attempt.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: attempt.id,
        passage: { id: passage.id, difficulty: 2, title: "Synchronizing with Effects", word_count: 60 },
        started_at: "2026-10-01T00:00:00.000Z",
        status: "expired",
      })
    })
  })

  describe("異常系", () => {
    it("Authorization ヘッダが無ければ 401 を返す", async () => {
      const res = await request(app).get("/api/attempt/1")

      expect(res.status).toBe(401)
    })

    it("他人の挑戦なら 404 を返し、その挑戦を変えない", async () => {
      const { passage } = await insertPublishedGeneratedPassage()
      const { token } = await createTestUser()
      const othersAttempt = await insertReadingAttempt(passage.id, { startedAt: new Date(Date.now() - DAY_MS - 1000) })

      const res = await request(app).get(`/api/attempt/${othersAttempt.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
      expect(await selectAttempt(othersAttempt.id)).toMatchObject({ status: "in_progress" })
    })

    it("存在しない挑戦なら 404 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/attempt/999999").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
    })

    it.each([
      ["数値でない", "abc"],
      ["0", "0"],
    ])("id が%sなら 400 を返す", async (_label, id) => {
      const { token } = await createTestUser()

      const res = await request(app).get(`/api/attempt/${id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
    })
  })
})
