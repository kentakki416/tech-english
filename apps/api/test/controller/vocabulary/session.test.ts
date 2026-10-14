import request from "supertest"

import { vocabularyCards, vocabularyReviews } from "@repo/db"

import { VocabularySessionController } from "../../../src/controller/vocabulary/session"
import { generateAccessToken } from "../../../src/lib/jwt"
import { DrizzlePassageAudioRepository } from "../../../src/repository/drizzle/passage-audio-repository"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { DrizzleVocabularyRepository } from "../../../src/repository/drizzle/vocabulary-repository"
import { DrizzleWordAudioRepository } from "../../../src/repository/drizzle/word-audio-repository"
import { vocabularyRouter } from "../../../src/routes/vocabulary-router"
import { insertPassageAudio } from "../../fixture/passage"
import { PASSAGE_BLOCKS } from "../../fixture/passage-content"
import { insertDictionaryEntry, insertReadPassage, insertVocabularyCard, insertWordAudio, insertWordLookup } from "../../fixture/vocabulary"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const app = createTestApp()

const AUDIO_BASE = "https://cdn.example.com"

app.use(
  "/api/vocabulary",
  vocabularyRouter({
    session: new VocabularySessionController(
      new DrizzleUserRepository(testDb),
      new DrizzleVocabularyRepository(testDb),
      new DrizzlePassageAudioRepository(testDb),
      new DrizzleWordAudioRepository(testDb),
      AUDIO_BASE,
    ),
  }),
)
attachUnhandledExceptionHandler(app)

/**
 * その時点のタイムゾーンでの日付（YYYY-MM-DD）
 */
const formatToday = (timeZone: string): string => new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date())

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/vocabulary/session", () => {
  describe("正常系", () => {
    it("問題を解いていないユーザーは cards が空", async () => {
      const { token, user } = await createTestUser()

      const res = await request(app).get("/api/vocabulary/session").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ cards: [], today: formatToday(user.timezone) })
    })

    it("調べた単語 → 読んだ本文の用語集の順にカードが並び、1 文の強調の位置まで返る", async () => {
      const { token, user } = await createTestUser()
      const read = await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      await insertDictionaryEntry("logic", "論理 / 理屈")
      await insertWordLookup(read.attempt, { lemma: "logic", source: "dictionary", surface: "logic" })

      const res = await request(app).get("/api/vocabulary/session").set("Authorization", `Bearer ${token}`)

      const logicText = PASSAGE_BLOCKS[2].text
      const optOutText = PASSAGE_BLOCKS[4].text
      expect(res.status).toBe(200)
      expect(res.body.cards.map((card: { lemma: string }) => card.lemma)).toEqual(["logic", "stay in sync with", "escape hatch", "opt out of"])
      expect(res.body.cards[0]).toEqual({
        lemma: "logic",
        meaning_ja: "論理 / 理屈",
        meaning_source: "dictionary",
        note_ja: null,
        part_of_speech: null,
        passage: { id: read.passage.id, title: read.passage.title },
        pronunciation: { sentence: null, word_url: null },
        sentence: { highlight_end: logicText.indexOf("logic") + 5, highlight_start: logicText.indexOf("logic"), text: logicText },
        stage: null,
        surface: "logic",
      })
      expect(res.body.cards[3]).toEqual({
        lemma: "opt out of",
        meaning_ja: "〜をやめる、（既定の動作を）無効にする",
        meaning_source: "glossary",
        note_ja: null,
        part_of_speech: "熟語",
        passage: { id: read.passage.id, title: read.passage.title },
        pronunciation: { sentence: null, word_url: null },
        sentence: { highlight_end: optOutText.indexOf("opt out of") + 10, highlight_start: optOutText.indexOf("opt out of"), text: optOutText },
        stage: null,
        surface: "opt out of",
      })
    })

    it("見出し語の発音が ready なら単語の URL、元の問題の読み上げの音声が ready なら 1 文の区間を返す（できていないカードは null）", async () => {
      const { token, user } = await createTestUser()
      const read = await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      const logicText = PASSAGE_BLOCKS[2].text
      await insertDictionaryEntry("logic", "論理 / 理屈")
      await insertWordLookup(read.attempt, { lemma: "logic", source: "dictionary", surface: "logic" })
      await insertWordAudio("logic")
      await insertWordAudio("escape hatch", { audioKey: null, generatedAt: null, status: "pending", textHash: null })
      await insertPassageAudio(read.passage.id, {
        manifest: {
          blocks: [{
            blockIndex: 2,
            parts: [{
              durationMs: 6000,
              key: `passages/${read.passage.id}/h/2-0.mp3`,
              words: [[120, 300, 0, 2], [5200, 5800, logicText.length - 7, logicText.length - 1]],
            }],
          }],
        },
      })

      const res = await request(app).get("/api/vocabulary/session").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      const pronunciations = Object.fromEntries(
        res.body.cards.map((card: { lemma: string, pronunciation: unknown }) => [card.lemma, card.pronunciation]),
      )
      expect(pronunciations).toEqual({
        "escape hatch": { sentence: null, word_url: null },
        "logic": {
          sentence: { end_ms: 5800, start_ms: 120, url: `${AUDIO_BASE}/passages/${read.passage.id}/h/2-0.mp3` },
          word_url: `${AUDIO_BASE}/words/logic.mp3`,
        },
        "opt out of": { sentence: null, word_url: null },
        "stay in sync with": { sentence: null, word_url: null },
      })
    })

    it("今日の復習のカードが新しい単語より先に来て、段階が入る", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      await insertVocabularyCard(user.id, { dueDate: "2026-01-01", lemma: "opt out of", stage: 2 })

      const res = await request(app).get("/api/vocabulary/session").set("Authorization", `Bearer ${token}`)

      expect(res.body.cards.map((card: { lemma: string, stage: number | null }) => [card.lemma, card.stage])).toEqual([
        ["opt out of", 2],
        ["stay in sync with", null],
        ["escape hatch", null],
      ])
    })

    it("呼んでもカードと答えの行は増えない（読み取りのみ）", async () => {
      const { token, user } = await createTestUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")

      await request(app).get("/api/vocabulary/session").set("Authorization", `Bearer ${token}`)

      expect(await testDb.$count(vocabularyCards)).toBe(0)
      expect(await testDb.$count(vocabularyReviews)).toBe(0)
    })
  })

  describe("異常系", () => {
    it("トークンなしは 401", async () => {
      const res = await request(app).get("/api/vocabulary/session")
      expect(res.status).toBe(401)
    })

    it("無効なトークンは 401", async () => {
      const res = await request(app).get("/api/vocabulary/session").set("Authorization", "Bearer invalid")
      expect(res.status).toBe(401)
    })

    it("トークンのユーザーが存在しなければ 401", async () => {
      const res = await request(app).get("/api/vocabulary/session").set("Authorization", `Bearer ${generateAccessToken(999999)}`)
      expect(res.status).toBe(401)
    })
  })
})
