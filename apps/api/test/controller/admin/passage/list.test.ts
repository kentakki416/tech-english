import request from "supertest"

import { AdminPassageListController } from "../../../../src/controller/admin/passage/list"
import { DrizzlePassageRepository } from "../../../../src/repository/drizzle/passage-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import {
  insertGeneratedPassage,
  insertPassage,
  insertPassageDocument,
  insertPassageSource,
  insertReadingAttempt,
} from "../../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageRepository = new DrizzlePassageRepository(testDb)

const app = createTestApp()

mountAdminApi(app, adminRouter({ passage: { list: new AdminPassageListController(passageRepository) } }))
attachUnhandledExceptionHandler(app)

let adminToken: string

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/passage", () => {
  describe("正常系", () => {
    it("既定では下書きを返し、状態ごとの件数（絞り込みなし）を付ける", async () => {
      const { document, passage, source } = await insertGeneratedPassage({
        attentionReasons: ["Q2：根拠の引用が段落 2 の本文に見つかりません"],
        needsAttention: true,
      })
      await insertPassage(document.id, { status: "published" })
      await insertPassage(document.id, { status: "collected" })

      const res = await request(app)
        .get("/api/admin/passage")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        has_more: false,
        next_cursor: null,
        passages: [
          {
            id: passage.id,
            attempt_count: 0,
            attention_reasons: ["Q2：根拠の引用が段落 2 の本文に見つかりません"],
            difficulty: 2,
            generation_error: null,
            needs_attention: true,
            question_count: 3,
            reject_reason: null,
            source: { id: source.id, name: "React 公式ドキュメント" },
            status: "draft",
            title: "Synchronizing with Effects",
            word_count: 60,
            updated_at: expect.any(String),
          },
        ],
        status_counts: { collected: 1, draft: 1, failed: 0, generating: 0, published: 1, rejected: 0 },
      })
    })

    it("limit で区切ると next_cursor が返り、それを渡すと続きのページを返す", async () => {
      const source = await insertPassageSource()
      const document = await insertPassageDocument(source.id)
      const first = await insertPassage(document.id, { needsAttention: true, updatedAt: new Date("2026-10-12T00:00:00.000Z") })
      const second = await insertPassage(document.id, { updatedAt: new Date("2026-10-10T00:00:00.000Z") })
      const third = await insertPassage(document.id, { updatedAt: new Date("2026-10-11T00:00:00.000Z") })

      const page1 = await request(app)
        .get("/api/admin/passage?status=draft&limit=2")
        .set("Authorization", `Bearer ${adminToken}`)
      const page2 = await request(app)
        .get("/api/admin/passage")
        .query({ cursor: page1.body.next_cursor, limit: 2, status: "draft" })
        .set("Authorization", `Bearer ${adminToken}`)

      expect(page1.status).toBe(200)
      expect(page1.body).toMatchObject({ has_more: true, next_cursor: expect.any(String) })
      expect(page1.body.passages.map((row: { id: number }) => row.id)).toEqual([first.id, second.id])
      expect(page2.status).toBe(200)
      expect(page2.body).toMatchObject({ has_more: false, next_cursor: null })
      expect(page2.body.passages.map((row: { id: number }) => row.id)).toEqual([third.id])
    })

    it("status・source_id・needs_attention で絞り込み、公開中の問題は挑戦の件数を返す", async () => {
      const { passage: published, source } = await insertGeneratedPassage({ status: "published" })
      await insertReadingAttempt(published.id)
      await insertGeneratedPassage({ status: "published" })
      const otherDocument = await insertPassageDocument(source.id, "src/content/learn/other.md")
      await insertPassage(otherDocument.id, { needsAttention: true, status: "published" })

      const res = await request(app)
        .get("/api/admin/passage")
        .query({ needs_attention: "false", source_id: source.id, status: "published" })
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.passages).toEqual([
        expect.objectContaining({ id: published.id, attempt_count: 1, needs_attention: false, status: "published" }),
      ])
      expect(res.body.status_counts).toMatchObject({ published: 3 })
    })

    it.each([
      ["1", 1],
      ["200", 200],
    ])("limit=%s は受け付ける（境界値）", async (limit) => {
      const res = await request(app)
        .get(`/api/admin/passage?limit=${limit}`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
    })
  })

  describe("異常系", () => {
    it("Authorization が無ければ 401 を返す", async () => {
      const res = await request(app).get("/api/admin/passage")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it.each([
      ["壊れた cursor", "cursor=broken"],
      ["limit=0", "limit=0"],
      ["limit=201", "limit=201"],
      ["存在しない status", "status=archived"],
      ["needs_attention が true / false でない", "needs_attention=yes"],
    ])("%sなら 400 を返す", async (_label, query) => {
      const res = await request(app)
        .get(`/api/admin/passage?${query}`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })
  })
})
