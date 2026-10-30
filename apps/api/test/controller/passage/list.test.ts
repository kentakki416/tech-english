import request from "supertest"

import { PassageListController } from "../../../src/controller/passage/list"
import { DrizzlePassageRepository } from "../../../src/repository/drizzle/passage-repository"
import { DrizzleReadingAttemptRepository } from "../../../src/repository/drizzle/reading-attempt-repository"
import { passageRouter } from "../../../src/routes/passage-router"
import {
  buildWebsiteSourceValues,
  insertGeneratedPassage,
  insertPassage,
  insertPassageContent,
  insertPassageDocument,
  insertPassageSource,
  insertPublishedPassage,
  insertReadingAttempt,
  insertSubmittedAttempt,
} from "../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const passageRepository = new DrizzlePassageRepository(testDb)
const readingAttemptRepository = new DrizzleReadingAttemptRepository(testDb)

const app = createTestApp()

app.use("/api/passage", passageRouter({ list: new PassageListController(passageRepository, readingAttemptRepository) }))
attachUnhandledExceptionHandler(app)

const at = (iso: string): Date => new Date(iso)

/**
 * 公開中 3 件（ソース・種別・タグ・難易度・公開日時がすべて違う）と、下書き・却下を 1 件ずつ入れる
 */
const insertPublishedSet = async () => {
  const reactSource = await insertPassageSource({ tags: ["react", "frontend"] })
  const rustSource = await insertPassageSource({
    kind: "github",
    name: "Rust RFCs",
    publicUrlStripPrefix: null,
    publicUrlTemplate: null,
    tags: ["rust"],
  })
  const goSource = await insertPassageSource(buildWebsiteSourceValues())
  const reactDocument = await insertPassageDocument(reactSource.id)
  const rustDocument = await insertPassageDocument(rustSource.id, "text/2094-nll.md")
  const goDocument = await insertPassageDocument(goSource.id, "/doc/effective_go")

  const react = await insertPublishedPassage(reactDocument.id, { difficulty: 1, publishedAt: at("2026-10-10T00:00:00.000Z") })
  await insertPassageContent(react.id)
  const rust = await insertPublishedPassage(rustDocument.id, { difficulty: 3, publishedAt: at("2026-10-11T00:00:00.000Z") })
  const go = await insertPublishedPassage(goDocument.id, { difficulty: 2, publishedAt: at("2026-10-12T00:00:00.000Z") })
  await insertPassage(reactDocument.id, { status: "draft" })
  await insertPassage(rustDocument.id, { rejectReason: "題材に不向き", status: "rejected" })
  return { go, react, rust }
}

const pickIds = (body: { passages: { id: number }[] }): number[] => body.passages.map((passage) => passage.id)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/passage", () => {
  describe("正常系", () => {
    it("公開中の問題だけを公開日時の新しい順に返し、タグ全件・件数・自分の挑戦状況を付ける", async () => {
      const { go, react, rust } = await insertPublishedSet()
      const { token } = await createTestUser()

      const res = await request(app).get("/api/passage").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        next_cursor: null,
        passages: [
          {
            id: go.id,
            difficulty: 2,
            my_status: { attempt_count: 0, best_correct_count: null, in_progress_attempt_id: null },
            question_count: 0,
            source: { kind: "docs", name: "Go 公式ドキュメント", tags: ["go"] },
            time_limit_seconds: 180,
            title: "Synchronizing with Effects",
            word_count: 60,
          },
          expect.objectContaining({ id: rust.id, difficulty: 3, source: { kind: "github", name: "Rust RFCs", tags: ["rust"] } }),
          expect.objectContaining({
            id: react.id,
            difficulty: 1,
            question_count: 3,
            source: { kind: "docs", name: "React 公式ドキュメント", tags: ["frontend", "react"] },
          }),
        ],
        tags: ["frontend", "go", "react", "rust"],
        total_count: 3,
      })
    })

    it.each([
      ["tag", "tag=react", ["react"], 1],
      ["tag（ソースの 2 つ目のタグ）", "tag=frontend", ["react"], 1],
      ["tag（カンマ区切りの OR）", "tag=go,rust", ["go", "rust"], 2],
      ["difficulty（カンマ区切りの OR）", "difficulty=1,3", ["rust", "react"], 2],
      ["difficulty と tag の組み合わせ", "difficulty=3&tag=react,rust", ["rust"], 1],
    ])("%sで絞り込み、total_count は絞り込み後の件数になる", async (_label, query, expected, totalCount) => {
      const set = await insertPublishedSet()
      const idByName: Record<string, number> = { go: set.go.id, react: set.react.id, rust: set.rust.id }
      const { token } = await createTestUser()

      const res = await request(app).get(`/api/passage?${query}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(pickIds(res.body)).toEqual(expected.map((name) => idByName[name]))
      expect(res.body.total_count).toBe(totalCount)
      expect(res.body.tags).toEqual(["frontend", "go", "react", "rust"])
    })

    it("unattempted_only=true なら自分が提出済みの問題を除く（挑戦中の問題は残す）", async () => {
      const { go, react, rust } = await insertPublishedSet()
      const { token, user } = await createTestUser()
      await insertSubmittedAttempt(rust.id, user.id, 2)
      await insertReadingAttempt(react.id, { userId: user.id })

      const res = await request(app).get("/api/passage?unattempted_only=true").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(pickIds(res.body)).toEqual([go.id, react.id])
      expect(res.body.total_count).toBe(2)
    })

    it("limit=2 で 3 件を 2 ページに分けて取れる", async () => {
      const { go, react, rust } = await insertPublishedSet()
      const { token } = await createTestUser()

      const page1 = await request(app).get("/api/passage?limit=2").set("Authorization", `Bearer ${token}`)
      const page2 = await request(app)
        .get("/api/passage")
        .query({ cursor: page1.body.next_cursor, limit: 2 })
        .set("Authorization", `Bearer ${token}`)

      expect(page1.status).toBe(200)
      expect(pickIds(page1.body)).toEqual([go.id, rust.id])
      expect(page1.body).toMatchObject({ next_cursor: expect.any(String), total_count: 3 })
      expect(page2.status).toBe(200)
      expect(pickIds(page2.body)).toEqual([react.id])
      expect(page2.body).toMatchObject({ next_cursor: null, total_count: 3 })
    })

    it("my_status は自分の提出済みの数と最高正答数、期限内の挑戦中を返す（他人の挑戦と 24 時間たった挑戦中は数えない）", async () => {
      const { passage } = await insertGeneratedPassage({ publishedAt: at("2026-10-12T00:00:00.000Z"), status: "published" })
      const { passage: stale } = await insertGeneratedPassage({ publishedAt: at("2026-10-11T00:00:00.000Z"), status: "published" })
      const { token, user } = await createTestUser()
      const { user: other } = await createTestUser({ email: "other@example.com" })
      await insertSubmittedAttempt(passage.id, user.id, 2)
      await insertSubmittedAttempt(passage.id, user.id, 3)
      await insertSubmittedAttempt(passage.id, other.id, 3)
      const resumed = await insertReadingAttempt(passage.id, { userId: user.id })
      await insertReadingAttempt(stale.id, { startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000), userId: user.id })

      const res = await request(app).get("/api/passage").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.passages.map((row: { my_status: unknown }) => row.my_status)).toEqual([
        { attempt_count: 2, best_correct_count: 3, in_progress_attempt_id: resumed.id },
        { attempt_count: 0, best_correct_count: null, in_progress_attempt_id: null },
      ])
    })

    it("公開中の問題が無ければ空の一覧を返す", async () => {
      await insertGeneratedPassage()
      const { token } = await createTestUser()

      const res = await request(app).get("/api/passage").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ next_cursor: null, passages: [], tags: [], total_count: 0 })
    })

    it.each([
      ["1", 1],
      ["50", 50],
    ])("limit=%s は受け付ける（境界値）", async (limit) => {
      const { token } = await createTestUser()

      const res = await request(app).get(`/api/passage?limit=${limit}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
    })
  })

  describe("異常系", () => {
    it("tag は名前の完全一致で、大文字・小文字だけが違う tag=REACT では react のタグのソースの問題を返さない", async () => {
      await insertPublishedSet()
      const { token } = await createTestUser()

      const res = await request(app).get("/api/passage?tag=REACT").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ next_cursor: null, passages: [], tags: ["frontend", "go", "react", "rust"], total_count: 0 })
    })

    it("Authorization ヘッダが無ければ 401 を返す", async () => {
      const res = await request(app).get("/api/passage")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it.each([
      ["difficulty=4", "difficulty=4"],
      ["difficulty が数値でない", "difficulty=easy"],
      ["limit=0", "limit=0"],
      ["limit=51", "limit=51"],
      ["unattempted_only が true / false でない", "unattempted_only=yes"],
      ["壊れた cursor", "cursor=broken"],
    ])("%sなら 400 を返す", async (_label, query) => {
      const { token } = await createTestUser()

      const res = await request(app).get(`/api/passage?${query}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body).toEqual(expect.objectContaining({ error: expect.any(String), status_code: 400 }))
    })
  })
})
