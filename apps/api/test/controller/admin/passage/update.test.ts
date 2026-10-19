import request from "supertest"

import type { AdminPassageDetailResponse } from "@repo/api-schema"
import { asc, eq, passageGlossaryEntries, passages, questions } from "@repo/db"

import { AdminPassageDetailController } from "../../../../src/controller/admin/passage/detail"
import { AdminPassageUpdateController } from "../../../../src/controller/admin/passage/update"
import { DrizzlePassageRepository } from "../../../../src/repository/drizzle/passage-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage, insertReadingAttempt } from "../../../fixture/passage"
import { PASSAGE_BLOCKS } from "../../../fixture/passage-content"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { convertDetailResponseToUpdateBody } from "./fixtures"

const passageRepository = new DrizzlePassageRepository(testDb)

const app = createTestApp()

mountAdminApi(app, adminRouter({
  passage: {
    detail: new AdminPassageDetailController(passageRepository),
    update: new AdminPassageUpdateController(passageRepository),
  },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

const fetchDetail = async (id: number): Promise<AdminPassageDetailResponse> => {
  const res = await request(app).get(`/api/admin/passage/${id}`).set("Authorization", `Bearer ${adminToken}`)
  return res.body
}

const selectQuestions = async (passageId: number) =>
  testDb.select().from(questions).where(eq(questions.passageId, passageId)).orderBy(asc(questions.orderIndex))

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("PUT /api/admin/passage/:id", () => {
  describe("正常系", () => {
    it("下書きを保存して保存後の全情報を返し、GET すると英文の修正に合わせて用語集の start_offset が変わっている", async () => {
      const { passage } = await insertGeneratedPassage()
      const before = await fetchDetail(passage.id)
      const body = convertDetailResponseToUpdateBody(before)
      body.blocks[1] = { text: `Today, ${PASSAGE_BLOCKS[1]?.text}`, translation_ja: "今日の和訳" }
      body.title = "Effects"
      body.difficulty = 3
      body.time_limit_seconds = 240

      const res = await request(app)
        .put(`/api/admin/passage/${passage.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        ...before,
        blocks: before.blocks.map((block, index) =>
          (index === 1 ? { ...block, text: `Today, ${PASSAGE_BLOCKS[1]?.text}`, translation_ja: "今日の和訳" } : block)),
        difficulty: 3,
        glossary: before.glossary.map((entry) => (entry.block_index === 1
          ? { ...entry, end_offset: entry.end_offset + 7, start_offset: entry.start_offset + 7 }
          : entry)),
        time_limit_seconds: 240,
        title: "Effects",
        updated_at: expect.any(String),
      })

      const after = await fetchDetail(passage.id)
      expect(after.glossary.map((entry) => entry.start_offset)).toEqual([24 + 7, 75 + 7, 8])
      expect(after.glossary.map((entry) => entry.id)).toEqual(before.glossary.map((entry) => entry.id))
      const [row] = await testDb.select().from(passages).where(eq(passages.id, passage.id))
      expect(row).toMatchObject({ difficulty: 3, timeLimitSeconds: 240, title: "Effects" })
    })

    it("挑戦が無ければ設問の数を変えられ（削除と追加）、新規の用語集を対象にできる", async () => {
      const { passage, questions: questionRows } = await insertGeneratedPassage()
      const body = convertDetailResponseToUpdateBody(await fetchDetail(passage.id))
      body.glossary.push({
        id: null,
        block_index: 2,
        lemma: "event handler",
        meaning_ja: "イベントハンドラ",
        note_ja: null,
        part_of_speech: "名詞",
        surface: "event handler",
      })
      body.questions = [
        body.questions[0],
        { ...body.questions[2], target_glossary_index: 3 },
        { ...body.questions[1], id: null, prompt: "A new detail question" },
        { ...body.questions[1], id: null, prompt: "Another detail question" },
      ]

      const res = await request(app)
        .put(`/api/admin/passage/${passage.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body)

      expect(res.status).toBe(200)
      expect(res.body.question_count).toBe(4)
      const added = res.body.glossary.find((entry: { surface: string }) => entry.surface === "event handler")
      expect(added).toEqual(expect.objectContaining({ id: expect.any(Number), end_offset: 90, start_offset: 77 }))
      const rows = await selectQuestions(passage.id)
      expect(rows.map((row) => row.id).slice(0, 2)).toEqual([questionRows[0].id, questionRows[2].id])
      expect(rows.map((row) => row.id)).not.toContain(questionRows[1].id)
      expect(rows[1]).toMatchObject({ targetGlossaryEntryId: added.id })
      expect(await testDb.select().from(passageGlossaryEntries).where(eq(passageGlossaryEntries.passageId, passage.id))).toHaveLength(4)
    })

    it("設問の和訳を保存して詳細で読め、語義の設問に送った選択肢の和訳は NULL で保存する", async () => {
      const { passage } = await insertGeneratedPassage()
      const body = convertDetailResponseToUpdateBody(await fetchDetail(passage.id))
      const choicesJa = ["比べ方を説明するため", "適した場面を説明するため", "使うべきでないと主張するため", "ウィジェットを紹介するため"]
      body.questions[0] = { ...body.questions[0], choices_ja: choicesJa, prompt_ja: "この文章の目的は何か。" }
      body.questions[2] = { ...body.questions[2], choices_ja: ["あ", "い", "う", "え"] }

      const res = await request(app)
        .put(`/api/admin/passage/${passage.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body)

      expect(res.status).toBe(200)
      const after = await fetchDetail(passage.id)
      expect(after.questions[0]).toMatchObject({ choices_ja: choicesJa, prompt_ja: "この文章の目的は何か。" })
      expect(after.questions[2]).toMatchObject({ choices_ja: null, type: "vocabulary" })
      expect((await selectQuestions(passage.id))[2]).toMatchObject({ choicesJa: null })
    })

    it("挑戦がある問題でも、設問の数を変えなければ文面と正解を直せる", async () => {
      const { passage } = await insertGeneratedPassage()
      await insertReadingAttempt(passage.id)
      const body = convertDetailResponseToUpdateBody(await fetchDetail(passage.id))
      body.questions[0] = { ...body.questions[0], correct_choice_index: 3, prompt: "What is the passage mainly about?" }

      const res = await request(app)
        .put(`/api/admin/passage/${passage.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body)

      expect(res.status).toBe(200)
      expect((await selectQuestions(passage.id))[0]).toMatchObject({ correctChoiceIndex: 3, prompt: "What is the passage mainly about?" })
    })
  })

  describe("異常系", () => {
    it("Authorization が無ければ 401 を返す", async () => {
      const { passage } = await insertGeneratedPassage()
      const body = convertDetailResponseToUpdateBody(await fetchDetail(passage.id))

      const res = await request(app).put(`/api/admin/passage/${passage.id}`).send(body)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("存在しない id なら 404 を返す", async () => {
      const { passage } = await insertGeneratedPassage()
      const body = convertDetailResponseToUpdateBody(await fetchDetail(passage.id))

      const res = await request(app)
        .put("/api/admin/passage/999999")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("公開中の問題は 409 を返し、何も変えない", async () => {
      const { passage } = await insertGeneratedPassage({ status: "published" })
      const body = { ...convertDetailResponseToUpdateBody(await fetchDetail(passage.id)), title: "Changed" }

      const res = await request(app)
        .put(`/api/admin/passage/${passage.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      const [row] = await testDb.select().from(passages).where(eq(passages.id, passage.id))
      expect(row).toMatchObject({ title: "Synchronizing with Effects" })
    })

    it("挑戦がある問題で設問を 1 つ消すと 409 を返し、設問は残る", async () => {
      const { passage } = await insertGeneratedPassage()
      await insertReadingAttempt(passage.id)
      const body = convertDetailResponseToUpdateBody(await fetchDetail(passage.id))
      body.questions = body.questions.slice(0, 2)

      const res = await request(app)
        .put(`/api/admin/passage/${passage.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
      expect(await selectQuestions(passage.id)).toHaveLength(3)
    })

    it("英文の修正で用語集の語句が本文から消えると 400 と details を返す", async () => {
      const { passage } = await insertGeneratedPassage()
      const body = convertDetailResponseToUpdateBody(await fetchDetail(passage.id))
      body.blocks[4] = { text: "You can skip re-running an Effect.", translation_ja: body.blocks[4]?.translation_ja ?? null }

      const res = await request(app)
        .put(`/api/admin/passage/${passage.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({
        details: [{ code: "glossary_surface_not_found", message: expect.any(String), path: ["glossary", 2, "surface"] }],
        error: expect.any(String),
        status_code: 400,
      })
    })

    it.each([
      ["選択肢が 3 つ", (body: ReturnType<typeof convertDetailResponseToUpdateBody>) => {
        body.questions[0] = { ...body.questions[0], choices: ["A", "B", "C"] }
      }],
      ["設問が 0 問", (body: ReturnType<typeof convertDetailResponseToUpdateBody>) => {
        body.questions = []
      }],
      ["タイトルが空白だけ", (body: ReturnType<typeof convertDetailResponseToUpdateBody>) => {
        body.title = "  "
      }],
    ])("%sなら 400 を返す", async (_label, edit) => {
      const { passage } = await insertGeneratedPassage()
      const body = convertDetailResponseToUpdateBody(await fetchDetail(passage.id))
      edit(body)

      const res = await request(app)
        .put(`/api/admin/passage/${passage.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })
  })
})
