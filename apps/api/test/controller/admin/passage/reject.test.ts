import request from "supertest"

import { eq, passages } from "@repo/db"

import { AdminPassageRejectController } from "../../../../src/controller/admin/passage/reject"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzlePassageRepository } from "../../../../src/repository/drizzle/passage-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage } from "../../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageRepository = new DrizzlePassageRepository(testDb)

const app = createTestApp()

app.use("/api/admin", adminRouter({ passage: { reject: new AdminPassageRejectController(passageRepository) } }))
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

describe("POST /api/admin/passage/:id/reject", () => {
  describe("正常系", () => {
    it("下書きを却下し、前後の空白を除いた理由と reviewed_at を記録する", async () => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/reject`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ reason: "  目次だけで題材に不向き  " })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: passage.id, status: "rejected" })
      expect(await selectPassage(passage.id)).toMatchObject({
        rejectReason: "目次だけで題材に不向き",
        reviewedAt: expect.any(Date),
        status: "rejected",
      })
    })

    it("理由が 1000 文字なら受け付ける（境界値）", async () => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/reject`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ reason: "a".repeat(1000) })

      expect(res.status).toBe(200)
    })
  })

  describe("異常系", () => {
    it.each([
      ["空白だけ", { reason: "   " }],
      ["無い", {}],
      ["1001 文字", { reason: "a".repeat(1001) }],
    ])("理由が%sなら 400 を返し、却下しない", async (_label, body) => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/reject`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(await selectPassage(passage.id)).toMatchObject({ rejectReason: null, status: "draft" })
    })

    it("公開中の問題は 409 を返す", async () => {
      const { passage } = await insertGeneratedPassage({ status: "published" })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/reject`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ reason: "不向き" })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .post("/api/admin/passage/999999/reject")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        .send({ reason: "不向き" })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("X-Admin-Token が無ければ 401 を返す", async () => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app).post(`/api/admin/passage/${passage.id}/reject`).send({ reason: "不向き" })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
