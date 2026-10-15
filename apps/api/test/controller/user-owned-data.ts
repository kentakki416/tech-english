import {
  attemptAnswers,
  attemptWordLookups,
  authAccounts,
  contentSources,
  eq,
  inArray,
  passageGlossaryEntries,
  passages,
  questions,
  readingAttempts,
  reminderSettings,
  sourceDocuments,
  userGoals,
  vocabularyCards,
  vocabularyReviews,
} from "@repo/db"

import { testDb } from "./setup"

/**
 * users から cascade でたどれるテーブル（users 自身を除く）1 つ分の、テストデータの入れ方と数え方
 */
type UserOwnedTable = {
  countRows: (userId: number) => Promise<number>
  seed: (userId: number) => Promise<void>
  tableName: string
}

/**
 * 挑戦が参照する問題（passages）を、ソース・取得文書・用語集の項目・設問ごと作る。
 * ユーザーごとに別の問題を作る（content_sources.repository と passages.content_hash が unique なので userId を含める）
 */
const insertPassageWithQuestion = async (userId: number): Promise<number> => {
  const [source] = await testDb
    .insert(contentSources)
    .values({
      branch: "main",
      fetchType: "github_repository",
      includeGlobs: ["docs/**/*.md"],
      kind: "docs",
      licenseSpdx: "MIT",
      licenseUrl: "https://example.com/LICENSE",
      name: `User owned data ${userId}`,
      repository: `example/user-owned-${userId}`,
    })
    .returning()
  const [document] = await testDb.insert(sourceDocuments).values({ path: "docs/index.md", sourceId: source.id }).returning()
  const [passage] = await testDb
    .insert(passages)
    .values({
      blocks: [{ text: "You can opt out of telemetry.", type: "paragraph" }],
      contentHash: `user-owned-${userId}`,
      sourceDocumentId: document.id,
      sourcePath: "docs/index.md",
      sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
      status: "published",
      title: "Telemetry",
      wordCount: 300,
    })
    .returning()
  await testDb.insert(passageGlossaryEntries).values({
    blockIndex: 0,
    endOffset: 18,
    lemma: "opt out of",
    meaningJa: "〜の利用をやめる",
    passageId: passage.id,
    startOffset: 8,
    surface: "opt out of",
  })
  await testDb.insert(questions).values({
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
  return passage.id
}

/**
 * reading_attempts の seed が作ったそのユーザーの挑戦と、その問題の設問・用語集の項目
 */
const findSeededAttempt = async (userId: number) => {
  const [row] = await testDb
    .select({
      attemptId: readingAttempts.id,
      glossaryEntryId: passageGlossaryEntries.id,
      passageId: readingAttempts.passageId,
      questionId: questions.id,
    })
    .from(readingAttempts)
    .innerJoin(questions, eq(questions.passageId, readingAttempts.passageId))
    .innerJoin(passageGlossaryEntries, eq(passageGlossaryEntries.passageId, readingAttempts.passageId))
    .where(eq(readingAttempts.userId, userId))
    .limit(1)
  if (!row) throw new Error(`reading_attempts の seed が先に必要（userId=${userId}）`)
  return row
}

/**
 * そのユーザーの挑戦の id（attempt_answers を数えるための副問い合わせ）
 */
const selectAttemptIds = (userId: number) =>
  testDb.select({ id: readingAttempts.id }).from(readingAttempts).where(eq(readingAttempts.userId, userId))

/**
 * users に紐づくテーブルの一覧。アカウント削除で cascade して消えることを確かめるのに使う。
 *
 * ユーザーに紐づくテーブルを足したら、ここにも足す（seed は依存する行も含めて作る）。
 * test/repository/user-delete-cascade.test.ts が、この一覧と users から cascade でたどれるテーブルが一致することを確かめている
 */
export const USER_OWNED_TABLES: readonly UserOwnedTable[] = [
  {
    countRows: async (userId) => testDb.$count(authAccounts, eq(authAccounts.userId, userId)),
    seed: async (userId) => {
      await testDb.insert(authAccounts).values({
        provider: "github",
        providerAccountId: `github-${userId}`,
        userId,
      })
    },
    tableName: "auth_accounts",
  },
  {
    countRows: async (userId) => testDb.$count(readingAttempts, eq(readingAttempts.userId, userId)),
    seed: async (userId) => {
      const passageId = await insertPassageWithQuestion(userId)
      await testDb.insert(readingAttempts).values({
        passageId,
        startedAt: new Date("2026-10-13T00:00:00.000Z"),
        timeLimitSeconds: 300,
        userId,
      })
    },
    tableName: "reading_attempts",
  },
  {
    /**
     * attempt_answers は user_id を持たないので、そのユーザーの挑戦を経由して数える
     */
    countRows: async (userId) => testDb.$count(attemptAnswers, inArray(attemptAnswers.attemptId, selectAttemptIds(userId))),
    seed: async (userId) => {
      const { attemptId, questionId } = await findSeededAttempt(userId)
      await testDb.insert(attemptAnswers).values({ attemptId, isCorrect: true, questionId, selectedChoiceIndex: 0 })
    },
    tableName: "attempt_answers",
  },
  {
    countRows: async (userId) => testDb.$count(attemptWordLookups, eq(attemptWordLookups.userId, userId)),
    seed: async (userId) => {
      const { attemptId, glossaryEntryId, passageId } = await findSeededAttempt(userId)
      await testDb.insert(attemptWordLookups).values([
        { attemptId, glossaryEntryId, lemma: "opt out of", passageId, source: "glossary", surface: "opt out of", userId },
        { attemptId, lemma: "telemetry", passageId, source: "dictionary", surface: "telemetry", userId },
      ])
    },
    tableName: "attempt_word_lookups",
  },
  {
    countRows: async (userId) => testDb.$count(userGoals, eq(userGoals.userId, userId)),
    seed: async (userId) => {
      await testDb.insert(userGoals).values({
        goalText: "英語の公式ドキュメントを辞書なしで読めるようになる",
        targetDate: "2027-03-31",
        userId,
        weeklyMetric: "passages",
        weeklyTarget: 5,
      })
    },
    tableName: "user_goals",
  },
  {
    countRows: async (userId) => testDb.$count(reminderSettings, eq(reminderSettings.userId, userId)),
    seed: async (userId) => {
      await testDb.insert(reminderSettings).values({
        isEnabled: true,
        time: "21:15",
        userId,
        weekdays: [1, 3, 5],
      })
    },
    tableName: "reminder_settings",
  },
  {
    countRows: async (userId) => testDb.$count(vocabularyCards, eq(vocabularyCards.userId, userId)),
    seed: async (userId) => {
      await testDb.insert(vocabularyCards).values({
        dueDate: "2026-10-17",
        lastReviewedAt: new Date("2026-10-14T03:00:00.000Z"),
        lemma: "opt out of",
        stage: 1,
        userId,
      })
    },
    tableName: "vocabulary_cards",
  },
  {
    countRows: async (userId) => testDb.$count(vocabularyReviews, eq(vocabularyReviews.userId, userId)),
    seed: async (userId) => {
      const [card] = await testDb
        .select({ id: vocabularyCards.id })
        .from(vocabularyCards)
        .where(eq(vocabularyCards.userId, userId))
        .limit(1)
      if (!card) throw new Error(`vocabulary_cards の seed が先に必要（userId=${userId}）`)
      await testDb.insert(vocabularyReviews).values({
        activeSeconds: 8,
        cardId: card.id,
        clientReviewId: crypto.randomUUID(),
        grade: "remembered",
        stageAfter: 1,
        stageBefore: null,
        studyDate: "2026-10-14",
        userId,
      })
    },
    tableName: "vocabulary_reviews",
  },
]

/**
 * USER_OWNED_TABLES のすべてのテーブルに、そのユーザーの行を入れる。
 * 後のテーブルが前のテーブルの行に依存できるよう、順番に入れる
 */
export const seedUserOwnedData = async (userId: number): Promise<void> => {
  for (const table of USER_OWNED_TABLES) {
    await table.seed(userId)
  }
}

/**
 * USER_OWNED_TABLES のテーブルごとの、そのユーザーの行数（テーブル名 → 行数）
 */
export const countUserOwnedRows = async (userId: number): Promise<Record<string, number>> => {
  const entries = await Promise.all(
    USER_OWNED_TABLES.map(async (table) => [table.tableName, await table.countRows(userId)] as const),
  )
  return Object.fromEntries(entries)
}
