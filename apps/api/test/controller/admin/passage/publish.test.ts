import request from "supertest"

import { eq, passages, questions } from "@repo/db"

import { AdminPassagePublishController } from "../../../../src/controller/admin/passage/publish"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzlePassageRepository } from "../../../../src/repository/drizzle/passage-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage } from "../../../fixture/passage"
import { PASSAGE_BLOCKS } from "../../../fixture/passage-content"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageRepository = new DrizzlePassageRepository(testDb)

const app = createTestApp()

app.use("/api/admin", adminRouter({ passage: { publish: new AdminPassagePublishController(passageRepository) } }))
attachUnhandledExceptionHandler(app)

const selectPassage = async (id: number) => {
  const [row] = await testDb.select().from(passages).where(eq(passages.id, id))
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

describe("POST /api/admin/passage/:id/publish", () => {
  describe("正常系", () => {
    it("公開の条件を満たす下書きを公開し、published_at / reviewed_at を記録する", async () => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/publish`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: passage.id, status: "published" })
      expect(await selectPassage(passage.id)).toMatchObject({
        publishedAt: expect.any(Date),
        reviewedAt: expect.any(Date),
        status: "published",
      })
    })
  })

  describe("異常系", () => {
    it("公開の条件を満たさなければ 400 と満たしていない条件の details を返し、公開しない", async () => {
      const blocks = PASSAGE_BLOCKS.map((block, index) => (index === 4 ? { text: block.text, type: block.type } : block))
      const { passage, questions: questionRows } = await insertGeneratedPassage({ blocks })
      await testDb.update(questions).set({ evidenceQuote: "it belongs in a reducer" }).where(eq(questions.id, questionRows[1].id))

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/publish`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({
        details: [
          { code: "evidence_not_found", message: expect.any(String), path: ["questions", 1, "evidence"] },
          { code: "translation_missing", message: expect.any(String), path: ["blocks", 4, "translation_ja"] },
        ],
        error: expect.any(String),
        status_code: 400,
      })
      expect(await selectPassage(passage.id)).toMatchObject({ publishedAt: null, status: "draft" })
    })

    it("公開中の問題は 409 を返す", async () => {
      const { passage } = await insertGeneratedPassage({ status: "published" })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/publish`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .post("/api/admin/passage/999999/publish")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("X-Admin-Token が無ければ 401 を返し、公開しない", async () => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app).post(`/api/admin/passage/${passage.id}/publish`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await selectPassage(passage.id)).toMatchObject({ status: "draft" })
    })
  })
})
