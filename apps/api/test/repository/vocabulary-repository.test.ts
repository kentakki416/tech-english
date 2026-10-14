import { eq, passageGlossaryEntries, passages } from "@repo/db"

import { DrizzleVocabularyRepository } from "../../src/repository/drizzle/vocabulary-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"
import { insertReadingAttempt, insertAttemptUser } from "../fixture/passage"
import { insertDictionaryEntry, insertReadPassage, insertVocabularyCard, insertWordLookup } from "../fixture/vocabulary"

const vocabularyRepository = new DrizzleVocabularyRepository(testDb)

const at = (iso: string): Date => new Date(iso)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("VocabularyRepository", () => {
  describe("findNewEncounters", () => {
    describe("正常系", () => {
      it("調べた単語（調べたのが新しい順）が先、読んだ本文の用語集（本文に出てくる順）が後に並ぶ", async () => {
        const user = await insertAttemptUser()
        const read = await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
        await insertDictionaryEntry("logic", "論理")
        await insertWordLookup(read.attempt, {
          createdAt: at("2026-10-10T02:00:00.000Z"),
          glossaryEntryId: read.glossaryIdByLemma.get("escape hatch"),
          lemma: "escape hatch",
          source: "glossary",
          surface: "escape hatch",
        })
        await insertWordLookup(read.attempt, { createdAt: at("2026-10-10T02:30:00.000Z"), lemma: "logic", source: "dictionary", surface: "logic" })

        const encounters = await vocabularyRepository.findNewEncounters(user.id, 10)

        expect(encounters.map((encounter) => encounter.lemma)).toEqual(["logic", "escape hatch", "stay in sync with", "opt out of"])
        expect(encounters[0]).toMatchObject({ dictionaryMeaningJa: "論理", glossary: null, surface: "logic" })
        expect(encounters[1].glossary).toMatchObject({ id: read.glossaryIdByLemma.get("escape hatch"), meaningJa: expect.any(String), surface: "escape hatch" })
        expect(encounters[1].passage).toEqual({ blocks: read.passage.blocks, id: read.passage.id, title: read.passage.title })
      })

      it("同じ見出し語が 2 つの問題の用語集にあれば、最後に提出した問題の行になる", async () => {
        const user = await insertAttemptUser()
        await insertReadPassage(user.id, "2026-10-09T03:00:00.000Z")
        const latest = await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")

        const encounters = await vocabularyRepository.findNewEncounters(user.id, 10)

        expect(encounters.map((encounter) => encounter.lemma)).toEqual(["stay in sync with", "escape hatch", "opt out of"])
        expect(encounters.every((encounter) => encounter.passage.id === latest.passage.id)).toBe(true)
      })

      it("同じ見出し語を 2 つの問題で調べていれば、最後に調べた方の語句・問題になる", async () => {
        const user = await insertAttemptUser()
        const older = await insertReadPassage(user.id, "2026-10-09T03:00:00.000Z")
        const newer = await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
        await insertDictionaryEntry("render", "表現する")
        await insertWordLookup(older.attempt, { createdAt: at("2026-10-09T02:00:00.000Z"), lemma: "render", source: "dictionary", surface: "rendered" })
        await insertWordLookup(newer.attempt, { createdAt: at("2026-10-10T02:00:00.000Z"), lemma: "render", source: "dictionary", surface: "rendering" })

        const [encounter] = await vocabularyRepository.findNewEncounters(user.id, 1)

        expect(encounter).toMatchObject({ lemma: "render", passage: { id: newer.passage.id }, surface: "rendering" })
      })

      it("大文字と小文字の見出し語は 1 件にまとまり、lemma は小文字になる", async () => {
        const user = await insertAttemptUser()
        const read = await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
        await insertDictionaryEntry("effect", "効果")
        await insertWordLookup(read.attempt, { createdAt: at("2026-10-10T02:00:00.000Z"), lemma: "Effect", source: "dictionary", surface: "Effect" })
        await insertWordLookup(read.attempt, { createdAt: at("2026-10-10T02:10:00.000Z"), lemma: "effect", source: "dictionary", surface: "effect" })

        const encounters = await vocabularyRepository.findNewEncounters(user.id, 10)

        expect(encounters.filter((encounter) => encounter.lemma === "effect")).toHaveLength(1)
        expect(encounters.some((encounter) => encounter.lemma === "Effect")).toBe(false)
      })

      it("カードのある見出し語は返らず、limit を超えない", async () => {
        const user = await insertAttemptUser()
        await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
        await insertVocabularyCard(user.id, { lemma: "stay in sync with" })

        expect((await vocabularyRepository.findNewEncounters(user.id, 10)).map((encounter) => encounter.lemma)).toEqual(["escape hatch", "opt out of"])
        expect(await vocabularyRepository.findNewEncounters(user.id, 1)).toHaveLength(1)
      })
    })

    describe("異常系（出さないもの）", () => {
      it("提出していない挑戦（in_progress / expired）の問題の用語集は返らない", async () => {
        const user = await insertAttemptUser()
        const read = await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
        const other = await insertAttemptUser()
        await insertReadingAttempt(read.passage.id, { userId: other.id })
        await insertReadingAttempt(read.passage.id, { status: "expired", userId: other.id })

        expect(await vocabularyRepository.findNewEncounters(other.id, 10)).toEqual([])
      })

      it("他のユーザーの調べた単語・挑戦は返らない", async () => {
        const owner = await insertAttemptUser()
        const read = await insertReadPassage(owner.id, "2026-10-10T03:00:00.000Z")
        await insertDictionaryEntry("logic", "論理")
        await insertWordLookup(read.attempt, { lemma: "logic", source: "dictionary", surface: "logic" })
        const other = await insertAttemptUser()

        expect(await vocabularyRepository.findNewEncounters(other.id, 10)).toEqual([])
      })

      it("公開中でなくなった問題の用語集は返らず、その問題で調べた単語は辞書に意味があれば本文なしで返り、無ければ返らない", async () => {
        const user = await insertAttemptUser()
        const read = await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
        await insertDictionaryEntry("escape hatch", "非常口")
        await insertWordLookup(read.attempt, {
          glossaryEntryId: read.glossaryIdByLemma.get("escape hatch"),
          lemma: "escape hatch",
          source: "glossary",
          surface: "escape hatch",
        })
        await insertWordLookup(read.attempt, {
          glossaryEntryId: read.glossaryIdByLemma.get("opt out of"),
          lemma: "opt out of",
          source: "glossary",
          surface: "opt out of",
        })
        await testDb.update(passages).set({ status: "draft" }).where(eq(passages.id, read.passage.id))

        const encounters = await vocabularyRepository.findNewEncounters(user.id, 10)

        expect(encounters).toEqual([
          {
            dictionaryMeaningJa: "非常口",
            glossary: null,
            lemma: "escape hatch",
            passage: { blocks: null, id: read.passage.id, title: read.passage.title },
            surface: "escape hatch",
          },
        ])
      })

      it("用語集の行が消えた（glossary_entry_id が NULL）調べた単語は、辞書に意味があれば辞書で返る", async () => {
        const user = await insertAttemptUser()
        const read = await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
        await insertDictionaryEntry("escape hatch", "非常口")
        const escapeId = read.glossaryIdByLemma.get("escape hatch")!
        await insertWordLookup(read.attempt, { glossaryEntryId: escapeId, lemma: "escape hatch", source: "glossary", surface: "escape hatch" })
        await testDb.delete(passageGlossaryEntries).where(eq(passageGlossaryEntries.id, escapeId))

        const encounters = await vocabularyRepository.findNewEncounters(user.id, 10)

        expect(encounters.find((encounter) => encounter.lemma === "escape hatch")).toMatchObject({ dictionaryMeaningJa: "非常口", glossary: null })
      })

      it("最後に調べた場所に意味が無くても、読んだ本文の用語集に意味があればそちらで返る", async () => {
        const user = await insertAttemptUser()
        const read = await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
        await insertWordLookup(read.attempt, { lemma: "opt out of", source: "dictionary", surface: "opt out of" })

        const encounter = (await vocabularyRepository.findNewEncounters(user.id, 10)).find((item) => item.lemma === "opt out of")

        expect(encounter?.glossary).toMatchObject({ id: read.glossaryIdByLemma.get("opt out of") })
      })
    })
  })

  describe("findDueCards", () => {
    it("次に出す日が今日・昨日のカードを due_date, id の昇順で返し、明日のカードと覚えた単語は返さない（境界値）", async () => {
      const user = await insertAttemptUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      await insertVocabularyCard(user.id, { dueDate: "2026-10-14", lemma: "opt out of", stage: 1 })
      await insertVocabularyCard(user.id, { dueDate: "2026-10-13", lemma: "escape hatch", stage: 2 })
      await insertVocabularyCard(user.id, { dueDate: "2026-10-15", lemma: "stay in sync with", stage: 0 })

      const due = await vocabularyRepository.findDueCards(user.id, "2026-10-14", 10)

      expect(due.map(({ card }) => card)).toEqual([
        { dueDate: "2026-10-13", id: expect.any(Number), lemma: "escape hatch", stage: 2 },
        { dueDate: "2026-10-14", id: expect.any(Number), lemma: "opt out of", stage: 1 },
      ])
      expect(due[0].encounter.glossary).toMatchObject({ surface: "escape hatch" })
    })

    it("覚えた単語（due_date が NULL）は返さない", async () => {
      const user = await insertAttemptUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      await insertVocabularyCard(user.id, { dueDate: null, lemma: "opt out of", stage: 4 })

      expect(await vocabularyRepository.findDueCards(user.id, "2026-10-14", 10)).toEqual([])
    })

    it("中身の材料が無いカード（候補から消えた見出し語）は飛ばし、limit 枚まで次のカードで埋める", async () => {
      const user = await insertAttemptUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      await insertVocabularyCard(user.id, { dueDate: "2026-10-10", lemma: "vanished" })
      await insertVocabularyCard(user.id, { dueDate: "2026-10-11", lemma: "opt out of" })
      await insertVocabularyCard(user.id, { dueDate: "2026-10-12", lemma: "escape hatch" })

      const due = await vocabularyRepository.findDueCards(user.id, "2026-10-14", 2)

      expect(due.map(({ card }) => card.lemma)).toEqual(["opt out of", "escape hatch"])
    })
  })

  describe("summarize", () => {
    it("今日の復習・新しい単語・復習中・覚えた単語の数と、今日より後で一番近い次の復習の日を返す", async () => {
      const user = await insertAttemptUser()
      await insertReadPassage(user.id, "2026-10-10T03:00:00.000Z")
      await insertVocabularyCard(user.id, { dueDate: "2026-10-14", lemma: "opt out of", stage: 1 })
      await insertVocabularyCard(user.id, { dueDate: "2026-10-20", lemma: "escape hatch", stage: 2 })
      await insertVocabularyCard(user.id, { dueDate: null, lemma: "resilient", stage: 4 })

      expect(await vocabularyRepository.summarize(user.id, "2026-10-14")).toEqual({
        dueCount: 1,
        learningCount: 2,
        masteredCount: 1,
        newCount: 1,
        nextDueDate: "2026-10-20",
      })
    })

    it("何も無いユーザーはすべて 0 で、次の復習の日は null", async () => {
      const user = await insertAttemptUser()

      expect(await vocabularyRepository.summarize(user.id, "2026-10-14")).toEqual({
        dueCount: 0,
        learningCount: 0,
        masteredCount: 0,
        newCount: 0,
        nextDueDate: null,
      })
    })
  })
})
