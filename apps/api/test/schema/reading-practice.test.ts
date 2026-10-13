import {
  attemptAnswers,
  attemptWordLookups,
  contentSources,
  dictionaryEntries,
  eq,
  passageGlossaryEntries,
  passages,
  questions,
  readingAttempts,
  sourceDocuments,
  sql,
  users,
} from "@repo/db"

import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

/**
 * reading_attempts / attempt_answers / attempt_word_lookups / dictionary_entries の制約を実 DB で確かめる
 * （docs/spec/reading-practice/tasks/step1-db-reading-attempts.md）。
 * 定数に無い値は Drizzle の型で弾かれるので、sql の生 insert / update で入れる。
 * users の削除で消えることは test/repository/user-delete-cascade.test.ts と test/controller/user/delete.test.ts が確かめる
 */

type ReadingAttemptInsert = typeof readingAttempts.$inferInsert

/**
 * Postgres のエラーコード（SQLSTATE）
 */
const CHECK_VIOLATION = "23514"
const FOREIGN_KEY_VIOLATION = "23503"
const UNIQUE_VIOLATION = "23505"

/**
 * 指定した制約で失敗したことを表す matcher。Drizzle は pg のエラーを DrizzleQueryError の cause に入れる。
 * 文言ではなく SQLSTATE と制約名で判定する（別の理由で失敗したのを見逃さないため）
 */
const buildViolationMatcher = (code: string, constraint: string) => ({
  cause: expect.objectContaining({ code, constraint }),
})

/**
 * 提出済みの挑戦が持つ列
 */
const SUBMITTED_COLUMNS = {
  correctCount: 2,
  elapsedSeconds: 280,
  isOvertime: false,
  questionCount: 3,
  status: "submitted",
  studyDate: "2026-10-13",
  submittedAt: new Date("2026-10-13T00:05:00.000Z"),
} satisfies Partial<ReadingAttemptInsert>

/**
 * 挑戦が参照するユーザーと問題（ソース・取得文書・用語集の項目・設問つき）を作る
 */
const setupUserAndPassage = async () => {
  const [user] = await testDb.insert(users).values({ email: "reader@example.com", name: "Reader" }).returning()
  const [source] = await testDb
    .insert(contentSources)
    .values({
      branch: "main",
      fetchType: "github_repository",
      includeGlobs: ["docs/**/*.md"],
      kind: "docs",
      licenseSpdx: "MIT",
      licenseUrl: "https://example.com/LICENSE",
      name: "Example",
      repository: "example/docs",
    })
    .returning()
  const [document] = await testDb.insert(sourceDocuments).values({ path: "docs/index.md", sourceId: source.id }).returning()
  const [passage] = await testDb
    .insert(passages)
    .values({
      blocks: [{ text: "You can opt out of telemetry.", type: "paragraph" }],
      contentHash: "hash-1",
      sourceDocumentId: document.id,
      sourcePath: "docs/index.md",
      sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
      status: "published",
      title: "Telemetry",
      wordCount: 300,
    })
    .returning()
  const [glossaryEntry] = await testDb
    .insert(passageGlossaryEntries)
    .values({
      blockIndex: 0,
      endOffset: 18,
      lemma: "opt out of",
      meaningJa: "〜の利用をやめる",
      passageId: passage.id,
      startOffset: 8,
      surface: "opt out of",
    })
    .returning()
  const [question] = await testDb
    .insert(questions)
    .values({
      choices: ["A", "B", "C", "D"],
      correctChoiceIndex: 0,
      evidenceBlockIndex: 0,
      evidenceQuote: "You can opt out of telemetry.",
      explanationJa: "解説",
      orderIndex: 0,
      passageId: passage.id,
      prompt: "What can you do?",
      type: "detail",
    })
    .returning()
  return { glossaryEntryId: glossaryEntry.id, passageId: passage.id, questionId: question.id, userId: user.id }
}

const insertAttempt = async (
  refs: { passageId: number; userId: number },
  overrides: Partial<ReadingAttemptInsert> = {},
) => {
  const [row] = await testDb
    .insert(readingAttempts)
    .values({
      passageId: refs.passageId,
      startedAt: new Date("2026-10-13T00:00:00.000Z"),
      timeLimitSeconds: 300,
      userId: refs.userId,
      ...overrides,
    })
    .returning()
  return row
}

const insertWordLookup = async (refs: { attemptId: number; glossaryEntryId: number; passageId: number; userId: number }) => {
  const [row] = await testDb
    .insert(attemptWordLookups)
    .values({
      attemptId: refs.attemptId,
      glossaryEntryId: refs.glossaryEntryId,
      lemma: "opt out of",
      passageId: refs.passageId,
      source: "glossary",
      surface: "opt out of",
      userId: refs.userId,
    })
    .returning()
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

describe("reading_attempts", () => {
  describe("正常系", () => {
    it("必須列だけで insert すると in_progress になり、提出の列は NULL・アシストの回数は 0 になる", async () => {
      const refs = await setupUserAndPassage()

      const row = await insertAttempt(refs)

      expect(row).toMatchObject({
        correctCount: null,
        elapsedSeconds: null,
        isOvertime: null,
        questionCount: null,
        status: "in_progress",
        studyDate: null,
        submittedAt: null,
        translatedBlockCount: 0,
        wordLookupCount: 0,
      })
    })

    it("提出の列がすべてあれば submitted にでき、study_date は YYYY-MM-DD の文字列で読み戻せる", async () => {
      const refs = await setupUserAndPassage()

      const row = await insertAttempt(refs, SUBMITTED_COLUMNS)

      expect(row).toMatchObject(SUBMITTED_COLUMNS)
    })

    it("in_progress を expired にすると、同じユーザー × 問題の in_progress をもう 1 つ入れられる", async () => {
      const refs = await setupUserAndPassage()
      const first = await insertAttempt(refs)
      await testDb.update(readingAttempts).set({ status: "expired" }).where(eq(readingAttempts.id, first.id))

      await insertAttempt(refs)

      expect(await testDb.$count(readingAttempts)).toBe(2)
    })

    it("submitted / expired はいくつあっても in_progress と並べられる（部分 unique index の対象外）", async () => {
      const refs = await setupUserAndPassage()
      await insertAttempt(refs, SUBMITTED_COLUMNS)
      await insertAttempt(refs, SUBMITTED_COLUMNS)
      await insertAttempt(refs, { status: "expired" })
      await insertAttempt(refs, { status: "expired" })

      await insertAttempt(refs)

      expect(await testDb.$count(readingAttempts)).toBe(5)
    })
  })

  describe("異常系", () => {
    it("同じユーザー × 問題に in_progress を 2 行入れると失敗する", async () => {
      const refs = await setupUserAndPassage()
      await insertAttempt(refs)

      await expect(insertAttempt(refs)).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "reading_attempts_user_id_passage_id_in_progress_key"),
      )
      expect(await testDb.$count(readingAttempts)).toBe(1)
    })

    it.each([
      ["submitted_at", { submittedAt: null }],
      ["elapsed_seconds", { elapsedSeconds: null }],
      ["is_overtime", { isOvertime: null }],
      ["question_count", { questionCount: null }],
      ["correct_count", { correctCount: null }],
      ["study_date", { studyDate: null }],
    ])("submitted で %s が NULL なら失敗する", async (_column, overrides) => {
      const refs = await setupUserAndPassage()

      await expect(insertAttempt(refs, { ...SUBMITTED_COLUMNS, ...overrides })).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "reading_attempts_submitted_columns_check"),
      )
    })

    it("status が定数に無いと失敗する", async () => {
      const refs = await setupUserAndPassage()
      const attempt = await insertAttempt(refs)

      await expect(
        testDb.execute(sql`UPDATE reading_attempts SET status = 'started' WHERE id = ${attempt.id}`),
      ).rejects.toMatchObject(buildViolationMatcher(CHECK_VIOLATION, "reading_attempts_status_check"))
    })

    it("挑戦のある passages の行は削除できない（restrict）", async () => {
      const refs = await setupUserAndPassage()
      await insertAttempt(refs)

      await expect(testDb.delete(passages).where(eq(passages.id, refs.passageId))).rejects.toMatchObject(
        buildViolationMatcher(FOREIGN_KEY_VIOLATION, "reading_attempts_passage_id_fkey"),
      )
    })
  })
})

describe("attempt_answers", () => {
  describe("正常系", () => {
    it.each([0, 3, null])("selected_choice_index = %s（範囲の境界と未回答）は insert できる", async (selectedChoiceIndex) => {
      const refs = await setupUserAndPassage()
      const attempt = await insertAttempt(refs)

      const [row] = await testDb
        .insert(attemptAnswers)
        .values({ attemptId: attempt.id, isCorrect: false, questionId: refs.questionId, selectedChoiceIndex })
        .returning()

      expect(row.selectedChoiceIndex).toBe(selectedChoiceIndex)
    })

    it("reading_attempts の行を消すと、回答と調べた単語も消える", async () => {
      const refs = await setupUserAndPassage()
      const attempt = await insertAttempt(refs)
      await testDb.insert(attemptAnswers).values({ attemptId: attempt.id, isCorrect: true, questionId: refs.questionId, selectedChoiceIndex: 0 })
      await insertWordLookup({ ...refs, attemptId: attempt.id })

      await testDb.delete(readingAttempts).where(eq(readingAttempts.id, attempt.id))

      expect(await testDb.$count(attemptAnswers)).toBe(0)
      expect(await testDb.$count(attemptWordLookups)).toBe(0)
    })
  })

  describe("異常系", () => {
    it("同じ (attempt_id, question_id) の 2 行目は失敗する", async () => {
      const refs = await setupUserAndPassage()
      const attempt = await insertAttempt(refs)
      const values = { attemptId: attempt.id, isCorrect: true, questionId: refs.questionId, selectedChoiceIndex: 0 }
      await testDb.insert(attemptAnswers).values(values)

      await expect(testDb.insert(attemptAnswers).values({ ...values, selectedChoiceIndex: 1 })).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "attempt_answers_attempt_id_question_id_key"),
      )
    })

    it.each([4, -1])("selected_choice_index = %d（範囲の外）は失敗する", async (selectedChoiceIndex) => {
      const refs = await setupUserAndPassage()
      const attempt = await insertAttempt(refs)

      await expect(
        testDb.insert(attemptAnswers).values({ attemptId: attempt.id, isCorrect: false, questionId: refs.questionId, selectedChoiceIndex }),
      ).rejects.toMatchObject(buildViolationMatcher(CHECK_VIOLATION, "attempt_answers_selected_choice_index_check"))
    })

    it("回答のある questions の行は削除できない（restrict）", async () => {
      const refs = await setupUserAndPassage()
      const attempt = await insertAttempt(refs)
      await testDb.insert(attemptAnswers).values({ attemptId: attempt.id, isCorrect: true, questionId: refs.questionId, selectedChoiceIndex: 0 })

      await expect(testDb.delete(questions).where(eq(questions.id, refs.questionId))).rejects.toMatchObject(
        buildViolationMatcher(FOREIGN_KEY_VIOLATION, "attempt_answers_question_id_fkey"),
      )
      expect(await testDb.$count(questions)).toBe(1)
    })
  })
})

describe("attempt_word_lookups", () => {
  describe("正常系", () => {
    it("用語集の項目を消すと glossary_entry_id が NULL になり、調べた記録は語句と見出し語で残る", async () => {
      const refs = await setupUserAndPassage()
      const attempt = await insertAttempt(refs)
      const lookup = await insertWordLookup({ ...refs, attemptId: attempt.id })

      await testDb.delete(passageGlossaryEntries).where(eq(passageGlossaryEntries.id, refs.glossaryEntryId))

      const [row] = await testDb.select().from(attemptWordLookups).where(eq(attemptWordLookups.id, lookup.id))
      expect(row).toMatchObject({ glossaryEntryId: null, lemma: "opt out of", source: "glossary", surface: "opt out of" })
    })
  })

  describe("異常系", () => {
    it("source が定数に無いと失敗する", async () => {
      const refs = await setupUserAndPassage()
      const attempt = await insertAttempt(refs)

      await expect(
        testDb.execute(sql`
          INSERT INTO attempt_word_lookups (attempt_id, user_id, passage_id, surface, lemma, source, updated_at)
          VALUES (${attempt.id}, ${refs.userId}, ${refs.passageId}, 'telemetry', 'telemetry', 'llm', now())
        `),
      ).rejects.toMatchObject(buildViolationMatcher(CHECK_VIOLATION, "attempt_word_lookups_source_check"))
    })
  })
})

describe("dictionary_entries", () => {
  describe("正常系", () => {
    it("小文字の見出し語（熟語・アクセント記号つきを含む）は insert できる", async () => {
      await testDb.insert(dictionaryEntries).values([
        { headword: "cache", meaningJa: "隠し場所" },
        { headword: "a level", meaningJa: "上級試験" },
        { headword: "résumé", meaningJa: "概要" },
      ])

      expect(await testDb.$count(dictionaryEntries)).toBe(3)
    })
  })

  describe("異常系", () => {
    it("見出し語に大文字を入れると失敗する", async () => {
      await expect(testDb.insert(dictionaryEntries).values({ headword: "Cache", meaningJa: "隠し場所" })).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "dictionary_entries_headword_check"),
      )
    })

    it("見出し語が重複すると失敗する", async () => {
      await testDb.insert(dictionaryEntries).values({ headword: "cache", meaningJa: "隠し場所" })

      await expect(testDb.insert(dictionaryEntries).values({ headword: "cache", meaningJa: "キャッシュ" })).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "dictionary_entries_headword_key"),
      )
    })
  })
})
