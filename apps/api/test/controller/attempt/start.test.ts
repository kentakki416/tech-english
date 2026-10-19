import request from "supertest"

import { eq, questions, readingAttempts, users } from "@repo/db"

import { AttemptStartController } from "../../../src/controller/attempt/start"
import { DrizzlePassageRepository } from "../../../src/repository/drizzle/passage-repository"
import { DrizzleReadingAttemptRepository } from "../../../src/repository/drizzle/reading-attempt-repository"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { passageRouter } from "../../../src/routes/passage-router"
import { insertGeneratedPassage, insertReadingAttempt } from "../../fixture/passage"
import { PASSAGE_BLOCKS, QUESTION_ITEMS } from "../../fixture/passage-content"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const passageRepository = new DrizzlePassageRepository(testDb)
const readingAttemptRepository = new DrizzleReadingAttemptRepository(testDb)
const userRepository = new DrizzleUserRepository(testDb)

const app = createTestApp()

app.use(
  "/api/passage",
  passageRouter({ start: new AttemptStartController(passageRepository, readingAttemptRepository, userRepository) }),
)
attachUnhandledExceptionHandler(app)

const COMMIT_SHA = "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b"
const DAY_MS = 24 * 60 * 60 * 1000

const insertPublishedGeneratedPassage = async () =>
  insertGeneratedPassage({ publishedAt: new Date("2026-10-12T03:00:00.000Z"), status: "published", timeLimitSeconds: 240 })

const selectAttemptsByUser = async (userId: number) =>
  testDb.select().from(readingAttempts).where(eq(readingAttempts.userId, userId)).orderBy(readingAttempts.id)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/passage/:id/attempt", () => {
  describe("正常系", () => {
    it("初回は 201 で解答中の形を返し、問題の制限時間で挑戦中の行を作る", async () => {
      const { glossary, passage, questions: questionRows } = await insertPublishedGeneratedPassage()
      const { token, user } = await createTestUser()

      const res = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        id: expect.any(Number),
        attribution: {
          commit_sha: COMMIT_SHA,
          license_spdx: "CC-BY-4.0",
          license_url: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
          page_url: "https://react.dev/learn/synchronizing-with-effects",
          permalink_url: expect.stringMatching(
            new RegExp(`^https://github\\.com/reactjs/react\\.dev-\\d+/blob/${COMMIT_SHA}/src/content/learn/synchronizing-with-effects\\.md$`),
          ),
          retrieved_at: "2026-10-10T03:00:00.000Z",
          source_kind: "docs",
          source_name: "React 公式ドキュメント",
        },
        blocks: [
          {
            lang: null,
            paragraph_number: null,
            segments: [
              { kind: "word", text: "Synchronizing" },
              { kind: "space", text: " " },
              { kind: "word", text: "with" },
              { kind: "space", text: " " },
              { kind: "word", text: "Effects" },
            ],
            text: "Synchronizing with Effects",
            translation_ja: "エフェクトによる同期",
            type: "heading",
          },
          {
            lang: null,
            paragraph_number: 1,
            segments: expect.any(Array),
            text: PASSAGE_BLOCKS[1]?.text,
            translation_ja: PASSAGE_BLOCKS[1]?.translationJa,
            type: "paragraph",
          },
          {
            lang: null,
            paragraph_number: 2,
            segments: expect.any(Array),
            text: PASSAGE_BLOCKS[2]?.text,
            translation_ja: PASSAGE_BLOCKS[2]?.translationJa,
            type: "paragraph",
          },
          { lang: "jsx", paragraph_number: null, segments: [], text: PASSAGE_BLOCKS[3]?.text, translation_ja: null, type: "code" },
          {
            lang: null,
            paragraph_number: 3,
            segments: [
              { kind: "word", text: "You" },
              { kind: "space", text: " " },
              { kind: "word", text: "can" },
              { kind: "space", text: " " },
              { glossary_entry_id: glossary[2]?.id, kind: "word", text: "opt out of" },
              { kind: "space", text: " " },
              { kind: "word", text: "re-running" },
              { kind: "space", text: " " },
              { kind: "word", text: "an" },
              { kind: "space", text: " " },
              { kind: "word", text: "Effect" },
              { kind: "space", text: " " },
              { kind: "word", text: "by" },
              { kind: "space", text: " " },
              { kind: "word", text: "specifying" },
              { kind: "space", text: " " },
              { kind: "word", text: "a" },
              { kind: "space", text: " " },
              { kind: "word", text: "dependency" },
              { kind: "space", text: " " },
              { kind: "word", text: "array" },
              { kind: "punct", text: "." },
            ],
            text: PASSAGE_BLOCKS[4]?.text,
            translation_ja: PASSAGE_BLOCKS[4]?.translationJa,
            type: "paragraph",
          },
        ],
        expires_at: expect.any(String),
        glossary: [
          {
            id: glossary[0]?.id,
            lemma: "stay in sync with",
            meaning_ja: "〜と同期した状態を保つ",
            note_ja: null,
            part_of_speech: "熟語",
            surface: "stay in sync with",
          },
          {
            id: glossary[2]?.id,
            lemma: "opt out of",
            meaning_ja: "〜をやめる、（既定の動作を）無効にする",
            note_ja: null,
            part_of_speech: "熟語",
            surface: "opt out of",
          },
        ],
        passage: { id: passage.id, difficulty: 2, title: "Synchronizing with Effects", word_count: 60 },
        questions: questionRows.map((question, index) => ({
          id: question.id,
          choices: QUESTION_ITEMS[index]?.choices,
          choices_ja: QUESTION_ITEMS[index]?.choicesJa,
          order_index: index,
          prompt: QUESTION_ITEMS[index]?.prompt,
          prompt_ja: QUESTION_ITEMS[index]?.promptJa,
          type: QUESTION_ITEMS[index]?.type,
        })),
        server_now: expect.any(String),
        started_at: expect.any(String),
        status: "in_progress",
        time_limit_seconds: 240,
      })
      expect(new Date(res.body.expires_at).getTime() - new Date(res.body.started_at).getTime()).toBe(DAY_MS)
      expect(Math.abs(new Date(res.body.server_now).getTime() - Date.now())).toBeLessThan(5000)

      const rows = await selectAttemptsByUser(user.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        id: res.body.id,
        passageId: passage.id,
        startedAt: new Date(res.body.started_at),
        status: "in_progress",
        timeLimitSeconds: 240,
      })
    })

    it("レスポンスに正解・解説・根拠を含まず、語義設問の対象語句（escape hatch）は用語集にもセグメントにも無い", async () => {
      const { glossary, passage } = await insertPublishedGeneratedPassage()
      const { token } = await createTestUser()

      const res = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(201)
      const serialized = JSON.stringify(res.body)
      expect(serialized).not.toContain("correct_choice_index")
      expect(serialized).not.toContain("explanation_ja")
      expect(serialized).not.toContain("evidence")
      expect(res.body).toHaveProperty("server_now")
      expect(res.body).toHaveProperty("expires_at")
      const escapeHatchId = glossary[1]?.id
      expect(res.body.glossary.map((entry: { id: number }) => entry.id)).not.toContain(escapeHatchId)
      const segmentGlossaryIds = res.body.blocks.flatMap((block: { segments: { glossary_entry_id?: number }[] }) =>
        block.segments.flatMap((segment) => segment.glossary_entry_id ?? []),
      )
      expect(segmentGlossaryIds).toEqual([glossary[0]?.id, glossary[2]?.id])
    })

    it("和訳の無い設問（設問の和訳より前に生成した問題）は prompt_ja / choices_ja が null", async () => {
      const { passage } = await insertPublishedGeneratedPassage()
      await testDb.update(questions).set({ choicesJa: null, promptJa: null }).where(eq(questions.passageId, passage.id))
      const { token } = await createTestUser()

      const res = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(201)
      expect(res.body.questions.map((question: { choices_ja: unknown; prompt_ja: unknown }) => [question.prompt_ja, question.choices_ja]))
        .toEqual([[null, null], [null, null], [null, null]])
    })

    it("2 回目は 200 で同じ挑戦を返し、行は増えない", async () => {
      const { passage } = await insertPublishedGeneratedPassage()
      const { token, user } = await createTestUser()
      const first = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      const res = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      expect(first.status).toBe(201)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ...first.body, server_now: expect.any(String) })
      expect(await selectAttemptsByUser(user.id)).toHaveLength(1)
    })

    it("開始から 23:59:59 の挑戦中は 200 で再開する（境界値）", async () => {
      const { passage } = await insertPublishedGeneratedPassage()
      const { token, user } = await createTestUser()
      const attempt = await insertReadingAttempt(passage.id, { startedAt: new Date(Date.now() - DAY_MS + 1000), userId: user.id })

      const res = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(attempt.id)
      expect(res.body.time_limit_seconds).toBe(180)
      const rows = await selectAttemptsByUser(user.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: attempt.id, status: "in_progress" })
    })

    it("開始から 24:00:00 の挑戦中は expired に更新し、新しい挑戦を 201 で作る（境界値）", async () => {
      const { passage } = await insertPublishedGeneratedPassage()
      const { token, user } = await createTestUser()
      const stale = await insertReadingAttempt(passage.id, { startedAt: new Date(Date.now() - DAY_MS), userId: user.id })

      const res = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(201)
      expect(res.body.id).not.toBe(stale.id)
      const rows = await selectAttemptsByUser(user.id)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({ id: stale.id, status: "expired" })
      expect(rows[1]).toMatchObject({ id: res.body.id, status: "in_progress", timeLimitSeconds: 240 })
    })

    it("非公開に戻された問題でも、期限内の挑戦中があれば 200 で再開できる", async () => {
      const { passage } = await insertGeneratedPassage({ status: "draft" })
      const { token, user } = await createTestUser()
      const attempt = await insertReadingAttempt(passage.id, { userId: user.id })

      const res = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(attempt.id)
    })
  })

  describe("異常系", () => {
    it("Authorization ヘッダが無ければ 401 を返す", async () => {
      const res = await request(app).post("/api/passage/1/attempt")

      expect(res.status).toBe(401)
    })

    it("ユーザーを削除した後の access token なら 401 を返し、挑戦を作らない", async () => {
      const { passage } = await insertPublishedGeneratedPassage()
      const { token, user } = await createTestUser()
      await testDb.delete(users).where(eq(users.id, user.id))

      const res = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await testDb.select().from(readingAttempts)).toEqual([])
    })

    it.each([
      ["draft"],
      ["rejected"],
    ] as const)("%s の問題で挑戦中が無ければ 404 を返し、挑戦を作らない", async (status) => {
      const { passage } = await insertGeneratedPassage({ status })
      const { token } = await createTestUser()

      const res = await request(app).post(`/api/passage/${passage.id}/attempt`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
      expect(await testDb.select().from(readingAttempts)).toEqual([])
    })

    it("存在しない問題なら 404 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app).post("/api/passage/999999/attempt").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
    })

    it.each([
      ["数値でない", "abc"],
      ["0", "0"],
    ])("id が%sなら 400 を返す", async (_label, id) => {
      const { token } = await createTestUser()

      const res = await request(app).post(`/api/passage/${id}/attempt`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
    })
  })
})
