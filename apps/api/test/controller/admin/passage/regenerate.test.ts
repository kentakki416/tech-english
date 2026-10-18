import request from "supertest"

import { eq, passageGlossaryEntries, passages, questions } from "@repo/db"

import { AdminPassageRegenerateController } from "../../../../src/controller/admin/passage/regenerate"
import { DrizzlePassageRepository } from "../../../../src/repository/drizzle/passage-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage, insertReadingAttempt } from "../../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageRepository = new DrizzlePassageRepository(testDb)

const app = createTestApp()

mountAdminApi(app, adminRouter({ passage: { regenerate: new AdminPassageRegenerateController(passageRepository) } }))
attachUnhandledExceptionHandler(app)

let adminToken: string

const selectPassage = async (id: number) => {
  const [row] = await testDb.select().from(passages).where(eq(passages.id, id))
  return row
}

const countContent = async (passageId: number) => ({
  glossary: (await testDb.select().from(passageGlossaryEntries).where(eq(passageGlossaryEntries.passageId, passageId))).length,
  questions: (await testDb.select().from(questions).where(eq(questions.passageId, passageId))).length,
})

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/passage/:id/regenerate", () => {
  describe("正常系", () => {
    it.each([
      ["下書き", "draft" as const],
      ["却下", "rejected" as const],
      ["失敗", "failed" as const],
    ])("%sの問題の生成した内容を消して collected に戻す", async (_label, status) => {
      const { passage } = await insertGeneratedPassage({ generationAttemptCount: 3, status })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/regenerate`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: passage.id, status: "collected" })
      expect(await selectPassage(passage.id)).toMatchObject({
        difficulty: null,
        generationAttemptCount: 0,
        generationModel: null,
        status: "collected",
        timeLimitSeconds: null,
      })
      expect(await countContent(passage.id)).toEqual({ glossary: 0, questions: 0 })
    })
  })

  describe("異常系", () => {
    it("挑戦がある問題は 409 を返し、何も消さない", async () => {
      const { passage } = await insertGeneratedPassage()
      await insertReadingAttempt(passage.id)

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/regenerate`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await selectPassage(passage.id)).toMatchObject({ status: "draft" })
      expect(await countContent(passage.id)).toEqual({ glossary: 3, questions: 3 })
    })

    it("公開中の問題は 409 を返す", async () => {
      const { passage } = await insertGeneratedPassage({ status: "published" })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/regenerate`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .post("/api/admin/passage/999999/regenerate")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("Authorization が無ければ 401 を返す", async () => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app).post(`/api/admin/passage/${passage.id}/regenerate`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
