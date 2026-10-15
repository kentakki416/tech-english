import request from "supertest"

import { SUBMIT_ATTEMPT_MAX_WORD_LENGTH, SUBMIT_ATTEMPT_MAX_WORD_LOOKUPS } from "@repo/api-schema"
import { attemptAnswers, attemptWordLookups, dictionaryEntries, eq, readingAttempts, users } from "@repo/db"
import { MAX_QUESTIONS_PER_PASSAGE } from "@repo/domain"

import { AttemptSubmitController } from "../../../src/controller/attempt/submit"
import { DrizzlePassageRepository } from "../../../src/repository/drizzle/passage-repository"
import { DrizzleReadingAttemptRepository } from "../../../src/repository/drizzle/reading-attempt-repository"
import { DrizzleTransactionRunner } from "../../../src/repository/drizzle/transaction-runner"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { attemptRouter } from "../../../src/routes/attempt-router"
import { insertGeneratedPassage, insertReadingAttempt } from "../../fixture/passage"
import { PASSAGE_BLOCKS, QUESTION_ITEMS } from "../../fixture/passage-content"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const passageRepository = new DrizzlePassageRepository(testDb)
const readingAttemptRepository = new DrizzleReadingAttemptRepository(testDb)
const transactionRunner = new DrizzleTransactionRunner(testDb)
const userRepository = new DrizzleUserRepository(testDb)

const app = createTestApp()

app.use(
  "/api/attempt",
  attemptRouter({
    submit: new AttemptSubmitController(passageRepository, readingAttemptRepository, transactionRunner, userRepository),
  }),
)
attachUnhandledExceptionHandler(app)

const COMMIT_SHA = "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b"
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 根拠のセグメントの範囲（用語集を全件使って分割したとき。test/service/attempt-service/fixtures.ts の EXPECTED_EVIDENCES と同じ）
 */
const EXPECTED_EVIDENCES = [
  { block_index: 1, quote: "Effects are an escape hatch from the React paradigm.", segment_end: 31, segment_start: 15 },
  { block_index: 2, quote: "it belongs in an event handler, not in an Effect", segment_end: 45, segment_start: 25 },
  { block_index: 1, quote: "Effects are an escape hatch", segment_end: 22, segment_start: 15 },
]

/**
 * その時点のタイムゾーンでの日付（YYYY-MM-DD。sv-SE の日付の書式は ISO 8601 と同じ）
 */
const formatToday = (timeZone: string): string => new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date())

/**
 * 設問・用語集つきの公開中の問題と、ログインしたユーザーの開始から 10 分たった挑戦中を入れる
 */
const setupAttempt = async (attemptOverrides: Partial<typeof readingAttempts.$inferInsert> = {}) => {
  const generated = await insertGeneratedPassage({ publishedAt: new Date("2026-10-12T03:00:00.000Z"), status: "published" })
  const { token, user } = await createTestUser()
  const startedAt = new Date(Date.now() - 10 * 60 * 1000)
  const attempt = await insertReadingAttempt(generated.passage.id, { startedAt, userId: user.id, ...attemptOverrides })
  return { ...generated, attempt, startedAt, token, user }
}

/**
 * 設問 1 は正解（B）、設問 2 は不正解（A）、設問 3 は未回答。調べた単語は用語集 1 件・辞書 2 件（同じ effect を 2 回）
 */
const buildRequestBody = (questionIds: number[], glossaryEntryId: number) => ({
  active_seconds: 150,
  answers: [
    { question_id: questionIds[0], selected_choice_index: 1 },
    { question_id: questionIds[1], selected_choice_index: 0 },
  ],
  listened_block_count: 3,
  translated_block_count: 2,
  word_lookups: [
    { glossary_entry_id: glossaryEntryId, lemma: "stay in sync with", source: "glossary", surface: "stay in sync with" },
    { glossary_entry_id: null, lemma: "Effect", source: "dictionary", surface: "Effects" },
    { glossary_entry_id: null, lemma: "effect", source: "dictionary", surface: "Effect" },
  ],
})

const selectAttempt = async (id: number) => {
  const [row] = await testDb.select().from(readingAttempts).where(eq(readingAttempts.id, id))
  return row
}

const selectAnswers = async (attemptId: number) =>
  testDb.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId)).orderBy(attemptAnswers.id)

const selectWordLookups = async (attemptId: number) =>
  testDb.select().from(attemptWordLookups).where(eq(attemptWordLookups.attemptId, attemptId)).orderBy(attemptWordLookups.id)

beforeEach(async () => {
  await cleanupTestData()
  await testDb.insert(dictionaryEntries).values({ headword: "effect", meaningJa: "結果、効果" })
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/attempt/:id/submit", () => {
  describe("正常系", () => {
    it("200 で正解・解説・根拠の範囲・読む速さ・調べた単語の意味（用語集と辞書）を含む結果を返す", async () => {
      const { attempt, glossary, passage, questions, startedAt, token } = await setupAttempt()

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send(buildRequestBody(questions.map((question) => question.id), glossary[0].id))

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: attempt.id,
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
        blocks: PASSAGE_BLOCKS.map((block, index) => ({
          lang: block.lang ?? null,
          paragraph_number: [null, 1, 2, null, 3][index],
          segments: expect.any(Array),
          text: block.text,
          translation_ja: block.type === "code" ? null : block.translationJa,
          type: block.type,
        })),
        correct_count: 1,
        elapsed_seconds: 150,
        glossary: glossary.map((entry) => ({
          id: entry.id,
          lemma: entry.lemma,
          meaning_ja: entry.meaningJa,
          note_ja: entry.noteJa,
          part_of_speech: entry.partOfSpeech,
          surface: entry.surface,
        })),
        is_overtime: false,
        listened_block_count: 3,
        passage: { id: passage.id, difficulty: 2, title: "Synchronizing with Effects", word_count: 60 },
        question_count: 3,
        questions: questions.map((question, index) => ({
          id: question.id,
          choices: QUESTION_ITEMS[index]?.choices,
          correct_choice_index: QUESTION_ITEMS[index]?.correctChoiceIndex,
          evidence: EXPECTED_EVIDENCES[index],
          explanation_ja: QUESTION_ITEMS[index]?.explanationJa,
          is_answer_key_changed: false,
          is_correct: index === 0,
          order_index: index,
          prompt: QUESTION_ITEMS[index]?.prompt,
          selected_choice_index: [1, 0, null][index],
          type: QUESTION_ITEMS[index]?.type,
        })),
        started_at: startedAt.toISOString(),
        status: "submitted",
        study_date: formatToday("Asia/Tokyo"),
        submitted_at: expect.any(String),
        time_limit_seconds: 180,
        translated_block_count: 2,
        word_lookup_count: 3,
        word_lookups: [
          { lemma: "stay in sync with", meaning_ja: "〜と同期した状態を保つ", source: "glossary", surface: "stay in sync with" },
          { lemma: "effect", meaning_ja: "結果、効果", source: "dictionary", surface: "Effects" },
        ],
        words_per_minute: 24,
      })
      expect(Math.abs(new Date(res.body.submitted_at).getTime() - Date.now())).toBeLessThan(5000)
      const segmentGlossaryIds = res.body.blocks.flatMap((block: { segments: { glossary_entry_id?: number }[] }) =>
        block.segments.flatMap((segment) => segment.glossary_entry_id ?? []),
      )
      expect(segmentGlossaryIds).toEqual(glossary.map((entry) => entry.id))
    })

    it("挑戦を submitted にして採点結果・時間・study_date・件数を保存し、全設問の回答と調べた単語を保存する", async () => {
      const { attempt, glossary, passage, questions, token, user } = await setupAttempt()

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send(buildRequestBody(questions.map((question) => question.id), glossary[0].id))

      expect(res.status).toBe(200)
      expect(await selectAttempt(attempt.id)).toMatchObject({
        correctCount: 1,
        elapsedSeconds: 150,
        isOvertime: false,
        listenedBlockCount: 3,
        questionCount: 3,
        status: "submitted",
        studyDate: formatToday("Asia/Tokyo"),
        submittedAt: new Date(res.body.submitted_at),
        translatedBlockCount: 2,
        wordLookupCount: 3,
      })
      const answers = await selectAnswers(attempt.id)
      expect(answers).toHaveLength(3)
      expect(answers).toMatchObject([
        { isCorrect: true, questionId: questions[0].id, selectedChoiceIndex: 1 },
        { isCorrect: false, questionId: questions[1].id, selectedChoiceIndex: 0 },
        { isCorrect: false, questionId: questions[2].id, selectedChoiceIndex: null },
      ])
      const common = { attemptId: attempt.id, passageId: passage.id, userId: user.id }
      expect(await selectWordLookups(attempt.id)).toMatchObject([
        { ...common, glossaryEntryId: glossary[0].id, lemma: "stay in sync with", source: "glossary", surface: "stay in sync with" },
        { ...common, glossaryEntryId: null, lemma: "effect", source: "dictionary", surface: "Effects" },
        { ...common, glossaryEntryId: null, lemma: "effect", source: "dictionary", surface: "Effect" },
      ])
    })

    it.each([
      ["2 なら 2", 2, 2],
      ["code 以外のブロック数（4）ちょうどはそのまま（境界値）", 4, 4],
      ["code 以外のブロック数（4）より大きければ 4 に切り詰める", 5, 4],
      ["0 なら 0", 0, 0],
    ])("listened_block_count が %s を保存して結果に返す", async (_label, listenedBlockCount, expected) => {
      const { attempt, token } = await setupAttempt()

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active_seconds: 10, answers: [], listened_block_count: listenedBlockCount, translated_block_count: 0, word_lookups: [] })

      expect(res.status).toBe(200)
      expect(res.body.listened_block_count).toBe(expected)
      expect(await selectAttempt(attempt.id)).toMatchObject({ listenedBlockCount: expected, status: "submitted" })
    })

    it("listened_block_count を省略すると 0 として保存する（送ってこない古いアプリ）", async () => {
      const { attempt, token } = await setupAttempt()

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active_seconds: 10, answers: [], translated_block_count: 0, word_lookups: [] })

      expect(res.status).toBe(200)
      expect(res.body.listened_block_count).toBe(0)
      expect(await selectAttempt(attempt.id)).toMatchObject({ listenedBlockCount: 0, status: "submitted" })
    })

    it("study_date はユーザーのタイムゾーンの日付にする", async () => {
      const { attempt, glossary, questions, token, user } = await setupAttempt()
      await testDb.update(users).set({ timezone: "America/Los_Angeles" }).where(eq(users.id, user.id))

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send(buildRequestBody(questions.map((question) => question.id), glossary[0].id))

      expect(res.status).toBe(200)
      expect(res.body.study_date).toBe(formatToday("America/Los_Angeles"))
      expect(await selectAttempt(attempt.id)).toMatchObject({ studyDate: formatToday("America/Los_Angeles") })
    })

    it("active_seconds を壁時計より大きく送ると、開始からの経過秒数に切り詰める", async () => {
      const { attempt, token } = await setupAttempt({ startedAt: new Date(Date.now() - 100 * 1000) })

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active_seconds: 5000, answers: [], translated_block_count: 0, word_lookups: [] })

      expect(res.status).toBe(200)
      expect(res.body.elapsed_seconds).toBeGreaterThanOrEqual(100)
      expect(res.body.elapsed_seconds).toBeLessThan(110)
      expect(res.body.is_overtime).toBe(false)
      expect(await selectAttempt(attempt.id)).toMatchObject({ elapsedSeconds: res.body.elapsed_seconds })
    })

    it("制限時間ちょうどは超過ではなく、1 秒超えると超過になる（境界値。制限時間は開始時点の値）", async () => {
      const exact = await setupAttempt({ timeLimitSeconds: 150 })
      const over = await setupAttempt({ timeLimitSeconds: 149 })
      const body = { active_seconds: 150, answers: [], translated_block_count: 0, word_lookups: [] }

      const exactRes = await request(app).post(`/api/attempt/${exact.attempt.id}/submit`).set("Authorization", `Bearer ${exact.token}`).send(body)
      const overRes = await request(app).post(`/api/attempt/${over.attempt.id}/submit`).set("Authorization", `Bearer ${over.token}`).send(body)

      expect(exactRes.status).toBe(200)
      expect(exactRes.body).toMatchObject({ elapsed_seconds: 150, is_overtime: false, time_limit_seconds: 150 })
      expect(overRes.status).toBe(200)
      expect(overRes.body).toMatchObject({ elapsed_seconds: 150, is_overtime: true, time_limit_seconds: 149 })
    })

    it("開始から 23:59:59 の挑戦は提出できる（境界値）", async () => {
      const { attempt, token } = await setupAttempt({ startedAt: new Date(Date.now() - DAY_MS + 1000) })

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active_seconds: 300, answers: [], translated_block_count: 0, word_lookups: [] })

      expect(res.status).toBe(200)
      expect(await selectAttempt(attempt.id)).toMatchObject({ elapsedSeconds: 300, status: "submitted" })
    })

    it("冪等: 回答を変えて 2 回目を送っても 200 で 1 回目と同じ結果を返し、DB の行は増えも変わりもしない", async () => {
      const { attempt, glossary, questions, token } = await setupAttempt()
      const questionIds = questions.map((question) => question.id)
      const first = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send(buildRequestBody(questionIds, glossary[0].id))
      const rowAfterFirst = await selectAttempt(attempt.id)

      const second = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          active_seconds: 10,
          answers: questionIds.map((questionId) => ({ question_id: questionId, selected_choice_index: 3 })),
          translated_block_count: 0,
          word_lookups: [],
        })

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(second.body).toEqual(first.body)
      expect(await selectAttempt(attempt.id)).toEqual(rowAfterFirst)
      expect(await selectAnswers(attempt.id)).toHaveLength(3)
      expect(await selectWordLookups(attempt.id)).toHaveLength(3)
    })

    it("同時に 2 回送っても両方 200 で同じ結果を返し、回答の行は 1 組だけ", async () => {
      const { attempt, glossary, questions, token } = await setupAttempt()
      const body = buildRequestBody(questions.map((question) => question.id), glossary[0].id)

      const [first, second] = await Promise.all([
        request(app).post(`/api/attempt/${attempt.id}/submit`).set("Authorization", `Bearer ${token}`).send(body),
        request(app).post(`/api/attempt/${attempt.id}/submit`).set("Authorization", `Bearer ${token}`).send(body),
      ])

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(second.body).toEqual(first.body)
      expect(await selectAnswers(attempt.id)).toHaveLength(3)
      expect(await selectWordLookups(attempt.id)).toHaveLength(3)
    })
  })

  describe("異常系", () => {
    it("Authorization ヘッダが無ければ 401 を返す", async () => {
      const res = await request(app).post("/api/attempt/1/submit").send({})

      expect(res.status).toBe(401)
    })

    it("ユーザーを削除した後の access token なら 401 を返す", async () => {
      const { attempt, token, user } = await setupAttempt()
      await testDb.delete(users).where(eq(users.id, user.id))

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active_seconds: 10, answers: [], translated_block_count: 0, word_lookups: [] })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("他人の挑戦なら 404 を返し、その挑戦を変えない", async () => {
      const { attempt } = await setupAttempt()
      const { token } = await createTestUser()

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active_seconds: 10, answers: [], translated_block_count: 0, word_lookups: [] })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
      expect(await selectAttempt(attempt.id)).toMatchObject({ status: "in_progress" })
    })

    it("開始から 24 時間たった挑戦は 409 を返し、DB を expired にする（境界値）", async () => {
      const { attempt, token } = await setupAttempt({ startedAt: new Date(Date.now() - DAY_MS) })

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active_seconds: 10, answers: [], translated_block_count: 0, word_lookups: [] })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await selectAttempt(attempt.id)).toMatchObject({ status: "expired", submittedAt: null })
      expect(await selectAnswers(attempt.id)).toEqual([])
    })

    it("同じ question_id が 2 回あれば 400 で原因の場所を返し、何も保存しない", async () => {
      const { attempt, questions, token } = await setupAttempt()

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          active_seconds: 10,
          answers: [
            { question_id: questions[0].id, selected_choice_index: 1 },
            { question_id: questions[0].id, selected_choice_index: 2 },
          ],
          translated_block_count: 0,
          word_lookups: [],
        })

      expect(res.status).toBe(400)
      expect(res.body.details).toEqual([{ code: "duplicate_question", message: expect.any(String), path: ["answers", 1, "question_id"] }])
      expect(await selectAttempt(attempt.id)).toMatchObject({ status: "in_progress" })
      expect(await selectAnswers(attempt.id)).toEqual([])
    })

    it.each([
      ["selected_choice_index が 4", { answers: [{ question_id: 1, selected_choice_index: 4 }] }],
      ["question_id が DB の integer の上限を超える", { answers: [{ question_id: 2147483648, selected_choice_index: 0 }] }],
      ["active_seconds が負", { active_seconds: -1 }],
      ["active_seconds が小数", { active_seconds: 1.5 }],
      ["listened_block_count が負", { listened_block_count: -1 }],
      ["listened_block_count が小数", { listened_block_count: 1.5 }],
      ["source が glossary なのに glossary_entry_id が null", {
        word_lookups: [{ glossary_entry_id: null, lemma: "x", source: "glossary", surface: "x" }],
      }],
      ["source が dictionary なのに glossary_entry_id がある", {
        word_lookups: [{ glossary_entry_id: 1, lemma: "x", source: "dictionary", surface: "x" }],
      }],
      ["lemma が空白だけ", { word_lookups: [{ glossary_entry_id: null, lemma: "  ", source: "dictionary", surface: "x" }] }],
      ["answers が設問数の上限より多い", {
        answers: Array.from({ length: MAX_QUESTIONS_PER_PASSAGE + 1 }, (_, index) => ({ question_id: index + 1, selected_choice_index: 0 })),
      }],
      ["word_lookups が上限より多い", {
        word_lookups: Array.from({ length: SUBMIT_ATTEMPT_MAX_WORD_LOOKUPS + 1 }, () => ({
          glossary_entry_id: null,
          lemma: "x",
          source: "dictionary",
          surface: "x",
        })),
      }],
      ["surface が長さの上限より長い", {
        word_lookups: [{ glossary_entry_id: null, lemma: "x", source: "dictionary", surface: "x".repeat(SUBMIT_ATTEMPT_MAX_WORD_LENGTH + 1) }],
      }],
    ])("%sなら 400 を返す", async (_label, overrides) => {
      const { attempt, token } = await setupAttempt()

      const res = await request(app)
        .post(`/api/attempt/${attempt.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active_seconds: 10, answers: [], translated_block_count: 0, word_lookups: [], ...overrides })

      expect(res.status).toBe(400)
      expect(await selectAttempt(attempt.id)).toMatchObject({ status: "in_progress" })
    })

    it("id が数値でなければ 400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/attempt/abc/submit")
        .set("Authorization", `Bearer ${token}`)
        .send({ active_seconds: 10, answers: [], translated_block_count: 0, word_lookups: [] })

      expect(res.status).toBe(400)
    })
  })
})
