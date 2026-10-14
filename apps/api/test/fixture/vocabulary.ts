import { attemptWordLookups, dictionaryEntries, vocabularyCards, vocabularyReviews } from "@repo/db"

import { testDb } from "../controller/setup"

import { createSubmittedAttempt } from "./learning-record"
import { insertGeneratedPassage } from "./passage"

/**
 * 単語帳（vocabulary-cards）のテスト用のヘルパー。Repository のテストと Controller のインテグレーションテストで使う
 */

type WordLookupInsert = typeof attemptWordLookups.$inferInsert
type VocabularyCardInsert = typeof vocabularyCards.$inferInsert
type VocabularyReviewInsert = typeof vocabularyReviews.$inferInsert

/**
 * 公開中の問題（用語集は stay in sync with / escape hatch / opt out of）と、そのユーザーの提出済みの挑戦を入れる
 */
export const insertReadPassage = async (userId: number, submittedAt: string, overrides: { status?: "draft" | "published" } = {}) => {
  const generated = await insertGeneratedPassage({ publishedAt: new Date("2026-10-01T03:00:00.000Z"), status: overrides.status ?? "published" })
  const attempt = await createSubmittedAttempt({
    passageId: generated.passage.id,
    questionIds: generated.questions.map((question) => question.id),
    studyDate: submittedAt.slice(0, 10),
    submittedAt: new Date(submittedAt),
    userId,
  })
  const glossaryIdByLemma = new Map(generated.glossary.map((entry) => [entry.lemma, entry.id]))
  return { attempt, glossary: generated.glossary, glossaryIdByLemma, passage: generated.passage }
}

/**
 * 調べた単語を入れる。挑戦の問題とユーザーにつなぐ
 */
export const insertWordLookup = async (
  attempt: { id: number; passageId: number; userId: number },
  values: Pick<WordLookupInsert, "lemma" | "source" | "surface"> & Partial<WordLookupInsert>,
) => {
  const [row] = await testDb
    .insert(attemptWordLookups)
    .values({ attemptId: attempt.id, passageId: attempt.passageId, userId: attempt.userId, ...values })
    .returning()
  return row
}

/**
 * 英和辞書の項目を入れる（テストごとに全テーブルが空になるので、使う見出し語だけ入れる）
 */
export const insertDictionaryEntry = async (headword: string, meaningJa: string) => {
  const [row] = await testDb.insert(dictionaryEntries).values({ headword, meaningJa, updatedAt: new Date() }).returning()
  return row
}

/**
 * カードを入れる。既定は段階 1・2026-10-17 に出す
 */
export const insertVocabularyCard = async (userId: number, values: Pick<VocabularyCardInsert, "lemma"> & Partial<VocabularyCardInsert>) => {
  const [row] = await testDb
    .insert(vocabularyCards)
    .values({ dueDate: "2026-10-17", lastReviewedAt: new Date("2026-10-14T03:00:00.000Z"), stage: 1, userId, ...values })
    .returning()
  return row
}

/**
 * 答えを入れる。既定は新しい単語に「覚えた」を付けた 8 秒の答え
 */
export const insertVocabularyReview = async (userId: number, cardId: number, values: Partial<VocabularyReviewInsert> = {}) => {
  const [row] = await testDb
    .insert(vocabularyReviews)
    .values({
      activeSeconds: 8,
      cardId,
      clientReviewId: crypto.randomUUID(),
      grade: "remembered",
      stageAfter: 1,
      stageBefore: null,
      studyDate: "2026-10-14",
      userId,
      ...values,
    })
    .returning()
  return row
}
