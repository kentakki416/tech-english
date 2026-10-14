import request from "supertest"

import { asc, eq, passageGlossaryEntries, passages, questions } from "@repo/db"

import { AdminPassageRestoreController } from "../../../../src/controller/admin/passage/restore"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzlePassageRepository } from "../../../../src/repository/drizzle/passage-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage, insertPassage, insertPassageDocument, insertPassageSource, insertReadingAttempt } from "../../../fixture/passage"
import { PASSAGE_BLOCKS } from "../../../fixture/passage-content"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageRepository = new DrizzlePassageRepository(testDb)

const app = createTestApp()

app.use("/api/admin", adminRouter({ passage: { restore: new AdminPassageRestoreController(passageRepository) } }))
attachUnhandledExceptionHandler(app)

const selectPassage = async (id: number) => {
  const [row] = await testDb.select().from(passages).where(eq(passages.id, id))
  return row
}

const selectQuestions = async (passageId: number) =>
  testDb.select().from(questions).where(eq(questions.passageId, passageId)).orderBy(asc(questions.orderIndex))

const selectGlossary = async (passageId: number) =>
  testDb.select().from(passageGlossaryEntries).where(eq(passageGlossaryEntries.passageId, passageId))

/**
 * LLM が題材に不向きと判定した行（設問・用語集・和訳なし）
 */
const insertRejectedByLlm = async () => {
  const source = await insertPassageSource()
  const document = await insertPassageDocument(source.id)
  return insertPassage(document.id, {
    blocks: PASSAGE_BLOCKS.map(({ translationJa: _translationJa, ...block }) => block),
    difficulty: null,
    generationAttemptCount: 1,
    rejectReason: "目次だけ",
    status: "rejected",
    timeLimitSeconds: null,
  })
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/passage/:id/restore", () => {
  describe("正常系", () => {
    it("設問のある却下を下書きに戻し、却下の理由だけを消す（設問・用語集・和訳・要確認は残す）", async () => {
      const reviewedAt = new Date("2026-10-13T05:00:00.000Z")
      const { passage } = await insertGeneratedPassage({
        attentionReasons: ["Q3：検証モデルは A を選択（正解は B）"],
        needsAttention: true,
        rejectReason: "誤って却下",
        reviewedAt,
        status: "rejected",
      })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/restore`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: passage.id, status: "draft" })
      expect(await selectPassage(passage.id)).toMatchObject({
        attentionReasons: ["Q3：検証モデルは A を選択（正解は B）"],
        blocks: PASSAGE_BLOCKS,
        difficulty: 2,
        needsAttention: true,
        rejectReason: null,
        reviewedAt,
        status: "draft",
        timeLimitSeconds: 180,
      })
      expect(await selectQuestions(passage.id)).toHaveLength(3)
      expect(await selectGlossary(passage.id)).toHaveLength(3)
    })

    it("挑戦がある却下も下書きに戻せる", async () => {
      const { passage } = await insertGeneratedPassage({ rejectReason: "不向き", status: "rejected" })
      await insertReadingAttempt(passage.id)

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/restore`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: passage.id, status: "draft" })
    })

    it("設問の無い却下（LLM が不向きと判定）は生成待ちに戻し、生成の記録と失敗の回数を空にする", async () => {
      const passage = await insertRejectedByLlm()

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/restore`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: passage.id, status: "collected" })
      expect(await selectPassage(passage.id)).toMatchObject({
        generatedAt: null,
        generationAttemptCount: 0,
        generationModel: null,
        generationPromptVersion: null,
        rejectReason: null,
        status: "collected",
        title: "Synchronizing with Effects",
      })
    })
  })

  describe("異常系", () => {
    it.each(["draft", "published", "failed", "collected"] as const)("%s の問題は 409 を返し、何も変えない", async (status) => {
      const { passage } = await insertGeneratedPassage({ status })

      const res = await request(app)
        .post(`/api/admin/passage/${passage.id}/restore`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await selectPassage(passage.id)).toMatchObject({ status })
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .post("/api/admin/passage/999999/restore")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("X-Admin-Token が無ければ 401 を返し、何も変えない", async () => {
      const { passage } = await insertGeneratedPassage({ rejectReason: "不向き", status: "rejected" })

      const res = await request(app).post(`/api/admin/passage/${passage.id}/restore`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await selectPassage(passage.id)).toMatchObject({ status: "rejected" })
    })
  })
})
