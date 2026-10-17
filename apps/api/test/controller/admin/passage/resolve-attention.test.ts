import request from "supertest"

import { eq, passages } from "@repo/db"

import { AdminPassageResolveAttentionController } from "../../../../src/controller/admin/passage/resolve-attention"
import { DrizzlePassageRepository } from "../../../../src/repository/drizzle/passage-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage } from "../../../fixture/passage"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageRepository = new DrizzlePassageRepository(testDb)

const app = createTestApp()

mountAdminApi(app, adminRouter({ passage: { resolveAttention: new AdminPassageResolveAttentionController(passageRepository) } }))
attachUnhandledExceptionHandler(app)

let adminToken: string

const selectPassage = async (id: number) => {
  const [row] = await testDb.select().from(passages).where(eq(passages.id, id))
  return row
}

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/passage/:id/attention/resolve", () => {
  describe("正常系", () => {
    it("要確認の印と理由を消す（状態と内容は変えない）", async () => {
      const { passage } = await insertGeneratedPassage({
        attentionReasons: ["Q3：検証モデルは A を選択（正解は B）", "段落 4 の和訳がありません"],
        needsAttention: true,
      })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/attention/resolve`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: passage.id, attention_reasons: [], needs_attention: false })
      expect(await selectPassage(passage.id)).toMatchObject({
        attentionReasons: [],
        needsAttention: false,
        status: "draft",
        title: "Synchronizing with Effects",
      })
    })

    it("解除済みの問題にもう一度送っても 200（冪等）", async () => {
      const { passage } = await insertGeneratedPassage({ attentionReasons: [], needsAttention: false })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/attention/resolve`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: passage.id, attention_reasons: [], needs_attention: false })
      expect(await selectPassage(passage.id)).toMatchObject({ attentionReasons: [], needsAttention: false })
    })

    it("下書き以外（公開中）の要確認も消せる", async () => {
      const { passage } = await insertGeneratedPassage({ attentionReasons: ["検証モデルでの確認に失敗しました"], needsAttention: true, status: "published" })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/attention/resolve`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(await selectPassage(passage.id)).toMatchObject({ attentionReasons: [], needsAttention: false, status: "published" })
    })
  })

  describe("異常系", () => {
    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .post("/api/admin/passage/999999/attention/resolve")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("id が数でなければ 400 を返す", async () => {
      const res = await request(app)
        .post("/api/admin/passage/abc/attention/resolve")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })

    it("Authorization が無ければ 401 を返し、何も変えない", async () => {
      const { passage } = await insertGeneratedPassage({ attentionReasons: ["理由"], needsAttention: true })

      const res = await request(app).post(`/api/admin/passage/${passage.id}/attention/resolve`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await selectPassage(passage.id)).toMatchObject({ attentionReasons: ["理由"], needsAttention: true })
    })
  })
})
