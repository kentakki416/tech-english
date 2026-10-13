import { contentSources, passageGlossaryEntries, passages, questions, readingAttempts, sourceDocuments, users } from "@repo/db"

import { testDb } from "../controller/setup"

import { GLOSSARY_ITEMS, locateGlossaryItem, PASSAGE_BLOCKS, QUESTION_ITEMS } from "./passage-content"

/**
 * 問題（ソース・取得文書・passages・用語集・設問）と挑戦を DB に入れるテスト用のヘルパー。
 * Repository の契約テストと Controller のインテグレーションテストで使う（reading-practice の API のテストでも使う想定）
 */

type ContentSourceInsert = typeof contentSources.$inferInsert
type PassageInsert = typeof passages.$inferInsert

let sequence = 0

/**
 * 連番（content_hash・メールアドレスなど unique な列に使う）
 */
const issueSequence = (): number => {
  sequence++
  return sequence
}

export const insertPassageSource = async (overrides: Partial<ContentSourceInsert> = {}) => {
  const [row] = await testDb
    .insert(contentSources)
    .values({
      branch: "main",
      fetchType: "github_repository",
      includeGlobs: ["src/content/learn/**/*.md"],
      isEnabled: true,
      kind: "docs",
      licenseSpdx: "CC-BY-4.0",
      licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
      name: "React 公式ドキュメント",
      publicUrlStripPrefix: "src/content/",
      publicUrlTemplate: "https://react.dev/{path}",
      repository: `reactjs/react.dev-${issueSequence()}`,
      tags: ["react"],
      ...overrides,
    })
    .returning()
  return row
}

export const insertPassageDocument = async (sourceId: number, path = "src/content/learn/synchronizing-with-effects.md") => {
  const [row] = await testDb.insert(sourceDocuments).values({ path, sourceId }).returning()
  return row
}

/**
 * 生成済みの下書きの passages の行を入れる（設問・用語集は insertPassageContent で入れる）
 */
export const insertPassage = async (sourceDocumentId: number, overrides: Partial<PassageInsert> = {}) => {
  const [row] = await testDb
    .insert(passages)
    .values({
      blocks: PASSAGE_BLOCKS,
      contentHash: `fixture-hash-${issueSequence()}`,
      difficulty: 2,
      generatedAt: new Date("2026-10-12T03:00:00.000Z"),
      generationModel: "claude-sonnet-5-5",
      generationPromptVersion: "2026-10-13",
      sourceCommitSha: "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b",
      sourceDocumentId,
      sourcePath: "src/content/learn/synchronizing-with-effects.md",
      sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
      status: "draft",
      timeLimitSeconds: 180,
      title: "Synchronizing with Effects",
      wordCount: 60,
      ...overrides,
    })
    .returning()
  return row
}

/**
 * GLOSSARY_ITEMS と QUESTION_ITEMS を、PASSAGE_BLOCKS の本文の問題に入れる。用語集は位置の順、設問は order_index の順で返す
 */
export const insertPassageContent = async (passageId: number) => {
  const glossary = await testDb
    .insert(passageGlossaryEntries)
    .values(GLOSSARY_ITEMS.map((item) => ({ ...item, ...locateGlossaryItem(PASSAGE_BLOCKS, item), passageId })))
    .returning()
  glossary.sort((left, right) => left.blockIndex - right.blockIndex || left.startOffset - right.startOffset)
  const glossaryIdBySurface = new Map(glossary.map((entry) => [entry.surface, entry.id]))
  const questionRows = await testDb
    .insert(questions)
    .values(QUESTION_ITEMS.map(({ targetGlossaryIndex, ...item }, index) => {
      const target = targetGlossaryIndex === null ? undefined : GLOSSARY_ITEMS[targetGlossaryIndex]
      return {
        ...item,
        orderIndex: index,
        passageId,
        targetGlossaryEntryId: target ? glossaryIdBySurface.get(target.surface) ?? null : null,
      }
    }))
    .returning()
  questionRows.sort((left, right) => left.orderIndex - right.orderIndex)
  return { glossary, questions: questionRows }
}

/**
 * ソース・取得文書・下書き（設問・用語集つき）をまとめて入れる
 */
export const insertGeneratedPassage = async (overrides: Partial<PassageInsert> = {}) => {
  const source = await insertPassageSource()
  const document = await insertPassageDocument(source.id)
  const passage = await insertPassage(document.id, overrides)
  const content = await insertPassageContent(passage.id)
  return { ...content, document, passage, source }
}

/**
 * 挑戦中の挑戦を、新しいユーザーで入れる
 */
export const insertReadingAttempt = async (passageId: number) => {
  const [user] = await testDb
    .insert(users)
    .values({ email: `attempt-user-${issueSequence()}@example.com`, name: "Attempt User" })
    .returning()
  const [attempt] = await testDb
    .insert(readingAttempts)
    .values({ passageId, startedAt: new Date(), timeLimitSeconds: 180, userId: user.id })
    .returning()
  return attempt
}
