import request from "supertest"

import { PassageDetailController } from "../../../src/controller/passage/detail"
import { DrizzlePassageRepository } from "../../../src/repository/drizzle/passage-repository"
import { DrizzleReadingAttemptRepository } from "../../../src/repository/drizzle/reading-attempt-repository"
import { passageRouter } from "../../../src/routes/passage-router"
import {
  buildWebsiteSourceValues,
  insertGeneratedPassage,
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

app.use("/api/passage", passageRouter({ detail: new PassageDetailController(passageRepository, readingAttemptRepository) }))
attachUnhandledExceptionHandler(app)

const COMMIT_SHA = "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b"

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/passage/:id", () => {
  describe("正常系", () => {
    it("公開中の問題は本文を含まない概要と出典を can_start: true で返し、挑戦中が無ければ in_progress_attempt は null", async () => {
      const { passage } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-12T03:00:00.000Z"), status: "published" })
      const { token } = await createTestUser()

      const res = await request(app).get(`/api/passage/${passage.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: passage.id,
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
        can_start: true,
        difficulty: 2,
        in_progress_attempt: null,
        question_count: 3,
        server_now: expect.any(String),
        time_limit_seconds: 180,
        title: "Synchronizing with Effects",
        word_count: 60,
      })
      expect(Math.abs(new Date(res.body.server_now).getTime() - Date.now())).toBeLessThan(5000)
    })

    it("期限内の自分の挑戦中があれば、開始と期限（開始の 24 時間後）を返す", async () => {
      const { passage } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-12T03:00:00.000Z"), status: "published" })
      const { token, user } = await createTestUser()
      const startedAt = new Date(Date.now() - 60 * 60 * 1000)
      const attempt = await insertReadingAttempt(passage.id, { startedAt, userId: user.id })
      await insertSubmittedAttempt(passage.id, user.id, 3)

      const res = await request(app).get(`/api/passage/${passage.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.in_progress_attempt).toEqual({
        id: attempt.id,
        expires_at: new Date(startedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        started_at: startedAt.toISOString(),
      })
    })

    it("24 時間たった挑戦中と他人の挑戦中は in_progress_attempt にしない", async () => {
      const { passage } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-12T03:00:00.000Z"), status: "published" })
      const { token, user } = await createTestUser()
      await insertReadingAttempt(passage.id, { startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000), userId: user.id })
      await insertReadingAttempt(passage.id)

      const res = await request(app).get(`/api/passage/${passage.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.in_progress_attempt).toBeNull()
    })

    it("非公開に戻された問題でも期限内の自分の挑戦中があれば、can_start: false と挑戦の開始時点の制限時間で返す", async () => {
      const { passage } = await insertGeneratedPassage({
        publishedAt: new Date("2026-10-12T03:00:00.000Z"),
        status: "draft",
        timeLimitSeconds: 240,
      })
      const { token, user } = await createTestUser()
      const startedAt = new Date(Date.now() - 60 * 60 * 1000)
      const attempt = await insertReadingAttempt(passage.id, { startedAt, timeLimitSeconds: 180, userId: user.id })

      const res = await request(app).get(`/api/passage/${passage.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        id: passage.id,
        attribution: { page_url: "https://react.dev/learn/synchronizing-with-effects", source_name: "React 公式ドキュメント" },
        can_start: false,
        difficulty: 2,
        in_progress_attempt: {
          id: attempt.id,
          expires_at: new Date(startedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          started_at: startedAt.toISOString(),
        },
        question_count: 3,
        time_limit_seconds: 180,
        title: "Synchronizing with Effects",
        word_count: 60,
      })
    })

    it("サイトの問題は出典のページの URL をサイトの URL から作り、permalink は null", async () => {
      const source = await insertPassageSource(buildWebsiteSourceValues({ siteUrl: "https://go.dev" }))
      const document = await insertPassageDocument(source.id, "/doc/effective_go")
      const passage = await insertPublishedPassage(document.id, { sourceCommitSha: null, sourcePath: "/doc/effective_go" })
      const { token } = await createTestUser()

      const res = await request(app).get(`/api/passage/${passage.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.attribution).toEqual({
        commit_sha: null,
        license_spdx: "BSD-3-Clause",
        license_url: "https://go.dev/LICENSE",
        page_url: "https://go.dev/doc/effective_go",
        permalink_url: null,
        retrieved_at: "2026-10-10T03:00:00.000Z",
        source_kind: "docs",
        source_name: "Go 公式ドキュメント",
      })
    })
  })

  describe("異常系", () => {
    it("Authorization ヘッダが無ければ 401 を返す", async () => {
      const res = await request(app).get("/api/passage/1")

      expect(res.status).toBe(401)
    })

    it.each([
      ["draft"],
      ["rejected"],
    ] as const)("%s の問題で自分の期限内の挑戦中が無ければ 404 を返す", async (status) => {
      const { passage } = await insertGeneratedPassage({ status })
      const { token } = await createTestUser()

      const res = await request(app).get(`/api/passage/${passage.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("非公開に戻された問題は、24 時間たった自分の挑戦中・提出済みの挑戦・他人の挑戦中があっても 404 を返す", async () => {
      const { passage } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-12T03:00:00.000Z"), status: "draft" })
      const { token, user } = await createTestUser()
      await insertReadingAttempt(passage.id, { startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000), userId: user.id })
      await insertSubmittedAttempt(passage.id, user.id, 3)
      await insertReadingAttempt(passage.id)

      const res = await request(app).get(`/api/passage/${passage.id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
    })

    it("存在しない id なら 404 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/passage/999999").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
    })

    it.each([
      ["数値でない", "abc"],
      ["0", "0"],
      ["DB の integer の上限を超える", "2147483648"],
    ])("id が%sなら 400 を返す", async (_label, id) => {
      const { token } = await createTestUser()

      const res = await request(app).get(`/api/passage/${id}`).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
    })
  })
})
