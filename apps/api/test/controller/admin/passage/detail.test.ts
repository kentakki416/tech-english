import request from "supertest"

import { AdminPassageDetailController } from "../../../../src/controller/admin/passage/detail"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzlePassageRepository } from "../../../../src/repository/drizzle/passage-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { insertGeneratedPassage, insertPassageAudio, insertReadingAttempt } from "../../../fixture/passage"
import { PASSAGE_BLOCKS, QUESTION_ITEMS } from "../../../fixture/passage-content"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const passageRepository = new DrizzlePassageRepository(testDb)

const app = createTestApp()

app.use("/api/admin", adminRouter({ passage: { detail: new AdminPassageDetailController(passageRepository) } }))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/passage/:id", () => {
  describe("正常系", () => {
    it("本文・和訳・設問と正解・用語集・要確認の理由・出典・制限時間の計算式を返す", async () => {
      const { glossary, passage, questions, source } = await insertGeneratedPassage({
        attentionReasons: ["Q3：検証モデルは A を選択（正解は B）"],
        needsAttention: true,
      })
      await insertReadingAttempt(passage.id)

      const res = await request(app)
        .get(`/api/admin/passage/${passage.id}`)
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: passage.id,
        attempt_count: 1,
        attention_reasons: ["Q3：検証モデルは A を選択（正解は B）"],
        audio: null,
        blocks: PASSAGE_BLOCKS.map((block) => ({
          lang: block.lang ?? null,
          text: block.text,
          translation_ja: block.translationJa ?? null,
          type: block.type,
        })),
        difficulty: 2,
        generated_at: "2026-10-12T03:00:00.000Z",
        generation_error: null,
        generation_model: "claude-sonnet-5-5",
        generation_prompt_version: "2026-10-13",
        glossary: [
          {
            id: glossary[0].id,
            block_index: 1,
            end_offset: 41,
            lemma: "stay in sync with",
            meaning_ja: "〜と同期した状態を保つ",
            note_ja: null,
            part_of_speech: "熟語",
            start_offset: 24,
            surface: "stay in sync with",
          },
          {
            id: glossary[1].id,
            block_index: 1,
            end_offset: 87,
            lemma: "escape hatch",
            meaning_ja: "（通常の仕組みから）必要なときに抜け出すための手段",
            note_ja: "技術文書では「逃げ道」の意味でよく使う",
            part_of_speech: "名詞",
            start_offset: 75,
            surface: "escape hatch",
          },
          {
            id: glossary[2].id,
            block_index: 4,
            end_offset: 18,
            lemma: "opt out of",
            meaning_ja: "〜をやめる、（既定の動作を）無効にする",
            note_ja: null,
            part_of_speech: "熟語",
            start_offset: 8,
            surface: "opt out of",
          },
        ],
        needs_attention: true,
        published_at: null,
        question_count: 3,
        questions: QUESTION_ITEMS.map((item, index) => ({
          id: questions[index].id,
          choices: item.choices,
          correct_choice_index: item.correctChoiceIndex,
          evidence: { block_index: item.evidenceBlockIndex, quote: item.evidenceQuote },
          explanation_ja: item.explanationJa,
          order_index: index,
          prompt: item.prompt,
          target_glossary_entry_id: item.type === "vocabulary" ? glossary[1].id : null,
          type: item.type,
          verification_choice_index: item.verificationChoiceIndex,
        })),
        reject_reason: null,
        reviewed_at: null,
        source: {
          id: source.id,
          commit_sha: "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b",
          name: "React 公式ドキュメント",
          path: "src/content/learn/synchronizing-with-effects.md",
          retrieved_at: "2026-10-10T03:00:00.000Z",
        },
        status: "draft",
        time_limit_formula: {
          rounding_seconds: 30,
          seconds_per_question: 40,
          wpm_by_difficulty: [
            { difficulty: 1, wpm: 100 },
            { difficulty: 2, wpm: 120 },
            { difficulty: 3, wpm: 140 },
          ],
        },
        time_limit_seconds: 180,
        title: "Synchronizing with Effects",
        word_count: 60,
        updated_at: expect.any(String),
      })
    })

    describe("読み上げの音声（audio）", () => {
      const PUBLISHED_AT = new Date("2026-10-12T03:00:00.000Z")

      const requestAudio = async (passageId: number) => {
        const res = await request(app).get(`/api/admin/passage/${passageId}`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)
        expect(res.status).toBe(200)
        return res.body.audio
      }

      it("音声の行が無い公開中の問題は pending（作成日時・エラーは null）", async () => {
        const { passage } = await insertGeneratedPassage({ publishedAt: PUBLISHED_AT, status: "published" })

        expect(await requestAudio(passage.id)).toEqual({ generated_at: null, last_error: null, status: "pending" })
      })

      it("音声の行が無い下書きは null", async () => {
        const { passage } = await insertGeneratedPassage()

        expect(await requestAudio(passage.id)).toBeNull()
      })

      it("ready の行は作成日時つきで ready", async () => {
        const { passage } = await insertGeneratedPassage({ publishedAt: PUBLISHED_AT, status: "published" })
        await insertPassageAudio(passage.id)

        expect(await requestAudio(passage.id)).toEqual({ generated_at: "2026-10-12T04:00:00.000Z", last_error: null, status: "ready" })
      })

      it("generating の行は generating をそのまま返す", async () => {
        const { passage } = await insertGeneratedPassage({ publishedAt: PUBLISHED_AT, status: "published" })
        await insertPassageAudio(passage.id, { generationStartedAt: new Date(), status: "generating" })

        expect(await requestAudio(passage.id)).toEqual({ generated_at: "2026-10-12T04:00:00.000Z", last_error: null, status: "generating" })
      })

      it("failed の行は last_error を返す", async () => {
        const { passage } = await insertGeneratedPassage({ publishedAt: PUBLISHED_AT, status: "published" })
        await insertPassageAudio(passage.id, {
          attemptCount: 3,
          generatedAt: null,
          lastError: "ServiceFailureException: Polly is unavailable",
          manifest: null,
          status: "failed",
        })

        expect(await requestAudio(passage.id)).toEqual({
          generated_at: null,
          last_error: "ServiceFailureException: Polly is unavailable",
          status: "failed",
        })
      })

      it("音声を作った後に公開し直された ready の行は、生成タスクが確かめるまで pending", async () => {
        const { passage } = await insertGeneratedPassage({ publishedAt: new Date("2026-10-12T05:00:00.000Z"), status: "published" })
        await insertPassageAudio(passage.id)

        expect(await requestAudio(passage.id)).toEqual({ generated_at: "2026-10-12T04:00:00.000Z", last_error: null, status: "pending" })
      })

      it("非公開に戻した問題でも音声の行があれば返す", async () => {
        const { passage } = await insertGeneratedPassage({ publishedAt: PUBLISHED_AT, status: "draft" })
        await insertPassageAudio(passage.id)

        expect(await requestAudio(passage.id)).toEqual({ generated_at: "2026-10-12T04:00:00.000Z", last_error: null, status: "ready" })
      })
    })
  })

  describe("異常系", () => {
    it("X-Admin-Token が無ければ 401 を返す", async () => {
      const { passage } = await insertGeneratedPassage()

      const res = await request(app).get(`/api/admin/passage/${passage.id}`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await request(app)
        .get("/api/admin/passage/999999")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it("id が数値でなければ 400 を返す", async () => {
      const res = await request(app)
        .get("/api/admin/passage/abc")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })
  })
})
