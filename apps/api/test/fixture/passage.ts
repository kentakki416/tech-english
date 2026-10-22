import {
  passageAudios,
  passageGlossaryEntries,
  passages,
  questions,
  readingAttempts,
  sourceDocuments,
  sources,
  users,
} from "@repo/db"

import { testDb } from "../controller/setup"

import { AUDIO_TEXT_HASH, buildAudioManifest } from "./passage-audio"
import { GLOSSARY_ITEMS, locateGlossaryItem, PASSAGE_BLOCKS, QUESTION_ITEMS } from "./passage-content"
import { insertSourceTags } from "./source-tag"

/**
 * 問題（ソース・取得文書・passages・用語集・設問）と挑戦を DB に入れるテスト用のヘルパー。
 * Repository のテストと Controller のインテグレーションテストで使う（reading-practice の API のテストでも使う想定）
 */

type SourceInsert = typeof sources.$inferInsert
type PassageAudioInsert = typeof passageAudios.$inferInsert
type PassageInsert = typeof passages.$inferInsert
type ReadingAttemptInsert = typeof readingAttempts.$inferInsert

/**
 * ソースの列と、付けるタグの名前（source_tags で付ける）
 */
type PassageSourceOverrides = Partial<SourceInsert> & { tags?: string[] }

let sequence = 0

/**
 * 連番（content_hash・メールアドレスなど unique な列に使う）
 */
const issueSequence = (): number => {
  sequence++
  return sequence
}

/**
 * ソースを入れ、tags（既定は react）を付ける
 */
export const insertPassageSource = async ({ tags: tagNames = ["react"], ...overrides }: PassageSourceOverrides = {}) => {
  const [row] = await testDb
    .insert(sources)
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
      ...overrides,
    })
    .returning()
  await insertSourceTags(row.id, tagNames)
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
 * サイト（website）のソースの列。insertPassageSource の overrides に渡す
 */
export const buildWebsiteSourceValues = (overrides: PassageSourceOverrides = {}): PassageSourceOverrides => ({
  branch: null,
  fetchType: "website",
  includeGlobs: ["/doc/**"],
  isEnabled: false,
  kind: "docs",
  licenseSpdx: "BSD-3-Clause",
  licenseUrl: "https://go.dev/LICENSE",
  name: "Go 公式ドキュメント",
  publicUrlStripPrefix: null,
  publicUrlTemplate: null,
  repository: null,
  siteUrl: `https://go-${issueSequence()}.example.com`,
  tags: ["go"],
  ...overrides,
})

/**
 * 公開中の問題の passages の行を入れる（設問・用語集は insertPassageContent で入れる）
 */
export const insertPublishedPassage = async (sourceDocumentId: number, overrides: Partial<PassageInsert> = {}) =>
  insertPassage(sourceDocumentId, {
    publishedAt: new Date("2026-10-12T03:00:00.000Z"),
    reviewedAt: new Date("2026-10-12T03:00:00.000Z"),
    status: "published",
    ...overrides,
  })

/**
 * 挑戦するユーザーを入れる
 */
export const insertAttemptUser = async () => {
  const [user] = await testDb
    .insert(users)
    .values({ email: `attempt-user-${issueSequence()}@example.com`, name: "Attempt User" })
    .returning()
  return user
}

/**
 * 挑戦を入れる。userId を渡さなければ新しいユーザーで入れる。既定は開始したばかりの挑戦中
 */
export const insertReadingAttempt = async (passageId: number, overrides: Partial<ReadingAttemptInsert> = {}) => {
  const userId = overrides.userId ?? (await insertAttemptUser()).id
  const [attempt] = await testDb
    .insert(readingAttempts)
    .values({ passageId, startedAt: new Date(), timeLimitSeconds: 180, ...overrides, userId })
    .returning()
  return attempt
}

/**
 * 提出済みの挑戦を入れる
 */
export const insertSubmittedAttempt = async (
  passageId: number,
  userId: number,
  correctCount: number,
  overrides: Partial<ReadingAttemptInsert> = {},
) =>
  insertReadingAttempt(passageId, {
    correctCount,
    elapsedSeconds: 150,
    isOvertime: false,
    questionCount: 3,
    startedAt: new Date("2026-10-12T00:00:00.000Z"),
    status: "submitted",
    studyDate: "2026-10-12",
    submittedAt: new Date("2026-10-12T00:02:30.000Z"),
    userId,
    ...overrides,
  })

/**
 * 読み上げの音声の行を入れる。既定は作成済み（ready。マニフェストのキーはその問題の ID）
 */
export const insertPassageAudio = async (passageId: number, overrides: Partial<PassageAudioInsert> = {}) => {
  const [row] = await testDb
    .insert(passageAudios)
    .values({
      billedCharacters: 4800,
      generatedAt: new Date("2026-10-12T04:00:00.000Z"),
      manifest: buildAudioManifest(passageId),
      passageId,
      status: "ready",
      textHash: AUDIO_TEXT_HASH,
      updatedAt: new Date("2026-10-12T04:00:00.000Z"),
      voiceId: "Joanna",
      ...overrides,
    })
    .returning()
  return row
}
