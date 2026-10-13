import request from "supertest"

import { eq, passages } from "@repo/db"

import { AdminPassageUnpublishController } from "../../../../src/controller/admin/passage/unpublish"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzlePassageRepository } from "../../../../src/repository/drizzle/passage-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage } from "../../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageRepository = new DrizzlePassageRepository(testDb)

const app = createTestApp()

app.use("/api/admin", adminRouter({ passage: { unpublish: new AdminPassageUnpublishController(passageRepository) } }))
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

describe("POST /api/admin/passage/:id/unpublish", () => {
  describe("正常系", () => {
    it("公開中の問題を下書きに戻し、published_at は残す", async () => {
      const publishedAt = new Date("2026-10-12T00:00:00.000Z")
      const { passage } = await insertGeneratedPassage({ publishedAt, status: "published" })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/unpublish`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: passage.id, status: "draft" })
      expect(await selectPassage(passage.id)).toMatchObject({ publishedAt, status: "draft" })
    })
  })

  describe("異常系", () => {
    it("下書きは 409 を返す", async () => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/unpublish`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .post("/api/admin/passage/999999/unpublish")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("X-Admin-Token が無ければ 401 を返し、公開のまま", async () => {
      const { passage } = await insertGeneratedPassage({ status: "published" })

      const res = await request(app).post(`/api/admin/passage/${passage.id}/unpublish`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await selectPassage(passage.id)).toMatchObject({ status: "published" })
    })
  })
})
