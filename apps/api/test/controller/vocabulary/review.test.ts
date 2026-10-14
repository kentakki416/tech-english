import request from "supertest"

import { vocabularyCards, vocabularyReviews } from "@repo/db"
import { addDaysToDate } from "@repo/domain"

import { VocabularyReviewController } from "../../../src/controller/vocabulary/review"
import { VocabularySessionController } from "../../../src/controller/vocabulary/session"
import { VocabularySummaryController } from "../../../src/controller/vocabulary/summary"
import { generateAccessToken } from "../../../src/lib/jwt"
import { DrizzleTransactionRunner } from "../../../src/repository/drizzle/transaction-runner"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { DrizzleVocabularyRepository } from "../../../src/repository/drizzle/vocabulary-repository"
import { vocabularyRouter } from "../../../src/routes/vocabulary-router"
import { insertReadPassage, insertVocabularyCard } from "../../fixture/vocabulary"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const userRepository = new DrizzleUserRepository(testDb)
const vocabularyRepository = new DrizzleVocabularyRepository(testDb)

const app = createTestApp()

app.use(
  "/api/vocabulary",
  vocabularyRouter({
    review: new VocabularyReviewController(new DrizzleTransactionRunner(testDb), userRepository, vocabularyRepository),
    session: new VocabularySessionController(userRepository, vocabularyRepository),
    summary: new VocabularySummaryController(userRepository, vocabularyRepository),
  }),
)
attachUnhandledExceptionHandler(app)

const formatToday = (timeZone: string): string => new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date())

const buildBody = (overrides: Record<string, unknown> = {}) => ({
  active_seconds: 8,
  client_review_id: crypto.randomUUID(),
  grade: "remembered",
  lemma: "opt out of",
  ...overrides,
})

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/vocabulary/review", () => {
  describe("正常系", () => {
    it("新しい単語に覚えたで 200 と段階 1・3 日後を返し、カードと答えが 1 行ずつできる", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      const today = formatToday(user.timezone)

      const res = await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(buildBody())

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ due_date: addDaysToDate(today, 3), lemma: "opt out of", stage: 1 })
      expect(await testDb.select().from(vocabularyCards)).toMatchObject([{ lemma: "opt out of", stage: 1, userId: user.id }])
      expect(await testDb.select().from(vocabularyReviews)).toMatchObject([{ activeSeconds: 8, stageBefore: null, studyDate: today, userId: user.id }])
    })

    it("今日の分の段階 2 のカードにまだを付けると段階 0・翌日になり、答えが 1 行増える", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      const today = formatToday(user.timezone)
      await insertVocabularyCard(user.id, { dueDate: today, lemma: "opt out of", stage: 2 })

      const res = await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(buildBody({ grade: "forgot" }))

      expect(res.body).toEqual({ due_date: addDaysToDate(today, 1), lemma: "opt out of", stage: 0 })
      expect(await testDb.select().from(vocabularyReviews)).toMatchObject([{ stageAfter: 0, stageBefore: 2 }])
    })

    it("答えたカード（次に出す日が今日より後）に別の client_review_id でもう一度答えても、段階は変わらず答えは 1 行（戻るボタンで古い 1 回分を答え直したとき）", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      const first = await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(buildBody())

      const second = await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(buildBody({ grade: "forgot" }))

      expect(second.status).toBe(200)
      expect(second.body).toEqual(first.body)
      expect(await testDb.select().from(vocabularyCards)).toMatchObject([{ stage: 1 }])
      expect(await testDb.$count(vocabularyReviews)).toBe(1)
    })

    it("同じ client_review_id で 2 回送ると 2 回目も同じ状態が返り、段階は 1 つしか進まず答えは 1 行", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      const body = buildBody()

      const first = await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(body)
      const second = await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(body)

      expect(second.status).toBe(200)
      expect(second.body).toEqual(first.body)
      expect(await testDb.select().from(vocabularyCards)).toMatchObject([{ stage: 1 }])
      expect(await testDb.$count(vocabularyReviews)).toBe(1)
    })

    it("同じ client_review_id の 2 つのリクエストを同時に送っても、答えは 1 行・段階は 1 つだけ進む", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      const body = buildBody()

      const responses = await Promise.all([
        request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(body),
        request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(body),
      ])

      expect(responses.map((res) => res.status)).toEqual([200, 200])
      expect(await testDb.select().from(vocabularyCards)).toMatchObject([{ stage: 1 }])
      expect(await testDb.$count(vocabularyReviews)).toBe(1)
    })

    it("見ていた秒数 999 は 200 で、60 秒で保存する", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")

      const res = await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(buildBody({ active_seconds: 999 }))

      expect(res.status).toBe(200)
      expect(await testDb.select().from(vocabularyReviews)).toMatchObject([{ activeSeconds: 60 }])
    })

    it("答えた後は 1 回分にそのカードが出ず、トップの新しい単語が 1 減って復習中が 1 増える", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      const before = await request(app).get("/api/vocabulary/summary").set("Authorization", `Bearer ${token}`)

      await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(buildBody())

      const session = await request(app).get("/api/vocabulary/session").set("Authorization", `Bearer ${token}`)
      const after = await request(app).get("/api/vocabulary/summary").set("Authorization", `Bearer ${token}`)
      expect(session.body.cards.map((card: { lemma: string }) => card.lemma)).not.toContain("opt out of")
      expect(after.body.new_count).toBe(before.body.new_count - 1)
      expect(after.body.learning_count).toBe(before.body.learning_count + 1)
    })
  })

  describe("異常系", () => {
    it("トークンなし・無効なトークンは 401", async () => {
      expect((await request(app).post("/api/vocabulary/review").send(buildBody())).status).toBe(401)
      expect((await request(app).post("/api/vocabulary/review").set("Authorization", "Bearer invalid").send(buildBody())).status).toBe(401)
    })

    it("トークンのユーザーが存在しなければ 401 で、行は作られない", async () => {
      const res = await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${generateAccessToken(999999)}`).send(buildBody())

      expect(res.status).toBe(401)
      expect(await testDb.$count(vocabularyCards)).toBe(0)
    })

    it("候補に無い見出し語は 404 で、行は作られない", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")

      const res = await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(buildBody({ lemma: "unknown" }))

      expect(res.status).toBe(404)
      expect(await testDb.$count(vocabularyCards)).toBe(0)
    })

    it.each([
      ["client_review_id が UUID でない", { client_review_id: "abc" }],
      ["client_review_id の欠落", { client_review_id: undefined }],
      ["grade が skip", { grade: "skip" }],
      ["lemma が空文字", { lemma: "" }],
      ["lemma が空白だけ", { lemma: "   " }],
      ["lemma が 201 文字", { lemma: "a".repeat(201) }],
      ["active_seconds が -1", { active_seconds: -1 }],
      ["active_seconds が 1.5", { active_seconds: 1.5 }],
      ["active_seconds の欠落", { active_seconds: undefined }],
    ])("%s は 400 で、行は作られない", async (_, overrides) => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")

      const res = await request(app).post("/api/vocabulary/review").set("Authorization", `Bearer ${token}`).send(buildBody(overrides))

      expect(res.status).toBe(400)
      expect(await testDb.$count(vocabularyCards)).toBe(0)
    })
  })
})
