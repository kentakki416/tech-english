import { contentSources, eq, passageGlossaryEntries, passages, questions, sourceDocuments, sql } from "@repo/db"

import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

/**
 * questions / passage_glossary_entries の制約を実 DB で確かめる（docs/spec/question-generation/tasks/step1-db-questions.md）。
 * 定数に無い値は Drizzle の型で弾かれるので、sql の生 insert で入れる
 */

type QuestionInsert = typeof questions.$inferInsert
type GlossaryEntryInsert = typeof passageGlossaryEntries.$inferInsert

const CHECK_VIOLATION = "23514"
const UNIQUE_VIOLATION = "23505"

/**
 * 指定した制約で失敗したことを表す matcher。Drizzle は pg のエラーを DrizzleQueryError の cause に入れる。
 * 文言ではなく SQLSTATE と制約名で判定する（別の理由で失敗したのを見逃さないため）
 */
const buildViolationMatcher = (code: string, constraint: string) => ({
  cause: expect.objectContaining({ code, constraint }),
})

/**
 * 設問・用語集が参照する passages の行を、ソース・取得文書ごと作る
 */
const insertPassage = async () => {
  const [source] = await testDb
    .insert(contentSources)
    .values({
      branch: "main",
      fetchType: "github_repository",
      includeGlobs: ["src/content/**/*.md"],
      kind: "docs",
      licenseSpdx: "CC-BY-4.0",
      licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
      name: "React 公式ドキュメント",
      repository: "reactjs/react.dev",
    })
    .returning()
  const [document] = await testDb.insert(sourceDocuments).values({ path: "src/content/learn/index.md", sourceId: source.id }).returning()
  const [passage] = await testDb
    .insert(passages)
    .values({
      blocks: [{ text: "You can opt out of telemetry.", type: "paragraph" }],
      contentHash: "hash-1",
      sourceDocumentId: document.id,
      sourcePath: "src/content/learn/index.md",
      sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
      title: "Telemetry",
      wordCount: 320,
    })
    .returning()
  return passage
}

const insertGlossaryEntry = async (passageId: number, overrides: Partial<GlossaryEntryInsert> = {}) => {
  const [row] = await testDb
    .insert(passageGlossaryEntries)
    .values({
      blockIndex: 0,
      endOffset: 18,
      lemma: "opt out of",
      meaningJa: "〜の利用をやめる",
      passageId,
      startOffset: 8,
      surface: "opt out of",
      ...overrides,
    })
    .returning()
  return row
}

const insertQuestion = async (passageId: number, overrides: Partial<QuestionInsert> = {}) => {
  const [row] = await testDb
    .insert(questions)
    .values({
      choices: ["To stop using it", "To start using it", "To delete it", "To update it"],
      correctChoiceIndex: 0,
      evidenceBlockIndex: 0,
      evidenceQuote: "You can opt out of telemetry.",
      explanationJa: "opt out of は「〜の利用をやめる」",
      orderIndex: 0,
      passageId,
      prompt: "What does the passage say about telemetry?",
      type: "detail",
      ...overrides,
    })
    .returning()
  return row
}

/**
 * 定数に無い値を入れるための生 insert。type / correct_choice_index / target_glossary_entry_id 以外は正しい値にする
 */
const insertRawQuestion = async (
  passageId: number,
  columns: { correctChoiceIndex: number; targetGlossaryEntryId: number | null; type: string },
) =>
  testDb.execute(sql`
    INSERT INTO questions (passage_id, order_index, type, prompt, choices, correct_choice_index, explanation_ja, evidence_block_index, evidence_quote, target_glossary_entry_id, updated_at)
    VALUES (${passageId}, 0, ${columns.type}, 'Prompt', '["a", "b", "c", "d"]', ${columns.correctChoiceIndex}, '解説', 0, 'Quote', ${columns.targetGlossaryEntryId}, now())
  `)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("passage_glossary_entries", () => {
  describe("正常系", () => {
    it("必須列だけで insert でき、品詞と補足は NULL になる", async () => {
      const passage = await insertPassage()

      const row = await insertGlossaryEntry(passage.id)

      expect(row).toMatchObject({ endOffset: 18, noteJa: null, partOfSpeech: null, passageId: passage.id, startOffset: 8 })
    })

    it("start_offset = 0・end_offset = start_offset + 1（範囲の境界）は insert できる", async () => {
      const passage = await insertPassage()

      const row = await insertGlossaryEntry(passage.id, { endOffset: 1, startOffset: 0 })

      expect(row).toMatchObject({ endOffset: 1, startOffset: 0 })
    })
  })

  describe("異常系", () => {
    it.each([
      ["start_offset が負", { endOffset: 3, startOffset: -1 }],
      ["end_offset = start_offset（空の範囲）", { endOffset: 8, startOffset: 8 }],
      ["end_offset < start_offset", { endOffset: 7, startOffset: 8 }],
    ])("%s なら失敗する", async (_label, offsets) => {
      const passage = await insertPassage()

      await expect(insertGlossaryEntry(passage.id, offsets)).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "passage_glossary_entries_offset_check"),
      )
    })
  })
})

describe("questions", () => {
  describe("正常系", () => {
    it("choices の jsonb が string[] として読み戻せ、用語集・検証の列は NULL になる", async () => {
      const passage = await insertPassage()

      const row = await insertQuestion(passage.id)

      expect(row).toMatchObject({
        choices: ["To stop using it", "To start using it", "To delete it", "To update it"],
        targetGlossaryEntryId: null,
        verificationChoiceIndex: null,
      })
    })

    it.each([0, 3])("correct_choice_index = %d（範囲の境界）は insert できる", async (correctChoiceIndex) => {
      const passage = await insertPassage()

      const row = await insertQuestion(passage.id, { correctChoiceIndex })

      expect(row.correctChoiceIndex).toBe(correctChoiceIndex)
    })

    it("vocabulary の設問は用語集の項目と紐づけられる", async () => {
      const passage = await insertPassage()
      const entry = await insertGlossaryEntry(passage.id)

      const row = await insertQuestion(passage.id, { targetGlossaryEntryId: entry.id, type: "vocabulary" })

      expect(row.targetGlossaryEntryId).toBe(entry.id)
    })

    it("order_index は負の値も入る（並べ替えの一時退避のため範囲の CHECK が無い）", async () => {
      const passage = await insertPassage()

      const row = await insertQuestion(passage.id, { orderIndex: -1 })

      expect(row.orderIndex).toBe(-1)
    })

    it("用語集の項目を消すと、設問の target_glossary_entry_id が NULL になり設問は残る", async () => {
      const passage = await insertPassage()
      const entry = await insertGlossaryEntry(passage.id)
      const question = await insertQuestion(passage.id, { targetGlossaryEntryId: entry.id, type: "vocabulary" })

      await testDb.delete(passageGlossaryEntries).where(eq(passageGlossaryEntries.id, entry.id))

      const [row] = await testDb.select().from(questions).where(eq(questions.id, question.id))
      expect(row).toMatchObject({ targetGlossaryEntryId: null, type: "vocabulary" })
    })

    it("passages の行を消すと、設問と用語集も消える", async () => {
      const passage = await insertPassage()
      const entry = await insertGlossaryEntry(passage.id)
      await insertQuestion(passage.id, { targetGlossaryEntryId: entry.id, type: "vocabulary" })

      await testDb.delete(passages).where(eq(passages.id, passage.id))

      expect(await testDb.$count(questions)).toBe(0)
      expect(await testDb.$count(passageGlossaryEntries)).toBe(0)
    })
  })

  describe("異常系", () => {
    it.each([
      ["type が定数に無い", { correctChoiceIndex: 0, targetGlossaryEntryId: null, type: "summary" }, "questions_type_check"],
      ["correct_choice_index = 4（範囲の外）", { correctChoiceIndex: 4, targetGlossaryEntryId: null, type: "detail" }, "questions_correct_choice_index_check"],
      ["correct_choice_index = -1（範囲の外）", { correctChoiceIndex: -1, targetGlossaryEntryId: null, type: "detail" }, "questions_correct_choice_index_check"],
    ])("%s と失敗する", async (_label, columns, constraint) => {
      const passage = await insertPassage()

      await expect(insertRawQuestion(passage.id, columns)).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, constraint),
      )
    })

    it("vocabulary 以外の設問に target_glossary_entry_id を入れると失敗する", async () => {
      const passage = await insertPassage()
      const entry = await insertGlossaryEntry(passage.id)

      await expect(insertQuestion(passage.id, { targetGlossaryEntryId: entry.id, type: "detail" })).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "questions_target_glossary_entry_check"),
      )
    })

    it("同じ (passage_id, order_index) の 2 行目は失敗する", async () => {
      const passage = await insertPassage()
      await insertQuestion(passage.id)

      await expect(insertQuestion(passage.id, { prompt: "別の設問" })).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "questions_passage_id_order_index_key"),
      )
      expect(await testDb.$count(questions)).toBe(1)
    })
  })
})
