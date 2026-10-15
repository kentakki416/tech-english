import type { AttemptAnswer, Passage, ReadingAttempt, User } from "@repo/domain"

import type { AttemptContent, UserRepository, WordLookupWithMeaning } from "../../../src/repository"
import { buildGlossaryEntries, buildPassage, buildQuestions, PASSAGE_BLOCKS, QUESTION_ITEMS } from "../../fixture/passage-content"

export const FIXED_NOW = new Date("2026-10-13T00:00:00.000Z")

/**
 * FIXED_NOW の 24 時間前（これより後に開始した in_progress だけが期限内）
 */
export const ALIVE_SINCE = new Date("2026-10-12T00:00:00.000Z")

export const USER: User = {
  id: 7,
  avatarUrl: null,
  email: "attempt@example.com",
  name: "Attempt User",
  timezone: "Asia/Tokyo",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
}

export const createMockUserRepository = () => ({
  create: vi.fn<UserRepository["create"]>(),
  deleteById: vi.fn<UserRepository["deleteById"]>(),
  findByEmail: vi.fn<UserRepository["findByEmail"]>(),
  findById: vi.fn<UserRepository["findById"]>(),
  findForAdmin: vi.fn<UserRepository["findForAdmin"]>(),
  updateProfile: vi.fn<UserRepository["updateProfile"]>(),
  updateTimezone: vi.fn<UserRepository["updateTimezone"]>(),
})

/**
 * 公開中の問題の内容（test/fixture/passage-content.ts の本文・用語集 101〜103・設問 201〜203。設問 203 は用語集 102 の語義設問）
 */
export const buildAttemptContent = (overrides: Partial<Passage> = {}): AttemptContent => {
  const glossary = buildGlossaryEntries()
  return {
    glossary,
    passage: buildPassage({
      publishedAt: new Date("2026-10-12T03:00:00.000Z"),
      reviewedAt: new Date("2026-10-12T03:00:00.000Z"),
      status: "published",
      ...overrides,
    }),
    questions: buildQuestions(glossary),
    source: {
      branch: "main",
      fetchType: "github_repository",
      kind: "docs",
      licenseSpdx: "CC-BY-4.0",
      licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
      name: "React 公式ドキュメント",
      publicUrlStripPrefix: "src/content/",
      publicUrlTemplate: "https://react.dev/{path}",
      repository: "reactjs/react.dev",
      tags: ["react"],
    },
  }
}

/**
 * 挑戦（既定は FIXED_NOW の 14 時間前に開始した挑戦中）
 */
export const buildAttempt = (overrides: Partial<ReadingAttempt> = {}): ReadingAttempt => ({
  id: 301,
  correctCount: null,
  elapsedSeconds: null,
  isOvertime: null,
  listenedBlockCount: 0,
  passageId: 1,
  questionCount: null,
  startedAt: new Date("2026-10-12T10:00:00.000Z"),
  status: "in_progress",
  studyDate: null,
  submittedAt: null,
  timeLimitSeconds: 180,
  translatedBlockCount: 0,
  userId: 7,
  wordLookupCount: 0,
  createdAt: new Date("2026-10-12T10:00:00.000Z"),
  updatedAt: new Date("2026-10-12T10:00:00.000Z"),
  ...overrides,
})

/**
 * 解答中の形の出典（buildAttemptContent のソース・問題から作ったもの）
 */
export const EXPECTED_ATTRIBUTION = {
  commitSha: "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b",
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
  pageUrl: "https://react.dev/learn/synchronizing-with-effects",
  permalinkUrl:
    "https://github.com/reactjs/react.dev/blob/3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b/src/content/learn/synchronizing-with-effects.md",
  retrievedAt: new Date("2026-10-12T03:00:00.000Z"),
  sourceKind: "docs",
  sourceName: "React 公式ドキュメント",
}

/**
 * 提出済みの挑戦（FIXED_NOW の 14 時間前に開始し、150 秒で 3 問中 1 問正解。和訳 2 段落・単語 3 回・読み上げ 1 段落）
 */
export const buildSubmittedAttempt = (overrides: Partial<ReadingAttempt> = {}): ReadingAttempt =>
  buildAttempt({
    correctCount: 1,
    elapsedSeconds: 150,
    isOvertime: false,
    listenedBlockCount: 1,
    questionCount: 3,
    status: "submitted",
    studyDate: "2026-10-13",
    submittedAt: FIXED_NOW,
    translatedBlockCount: 2,
    wordLookupCount: 3,
    ...overrides,
  })

/**
 * 保存済みの回答（設問 201 は正解、202 は不正解、203 は未回答）
 */
export const buildStoredAnswers = (attemptId = 301): AttemptAnswer[] => [
  { id: 401, attemptId, isCorrect: true, questionId: 201, selectedChoiceIndex: 1, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
  { id: 402, attemptId, isCorrect: false, questionId: 202, selectedChoiceIndex: 0, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
  { id: 403, attemptId, isCorrect: false, questionId: 203, selectedChoiceIndex: null, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
]

/**
 * 保存済みの調べた単語と意味（用語集 101 を 2 回、辞書の effect を 2 回、用語集が消された 1 件）
 */
export const buildStoredWordLookups = (attemptId = 301): WordLookupWithMeaning[] => {
  const common = { attemptId, passageId: 1, userId: 7, createdAt: FIXED_NOW, updatedAt: FIXED_NOW }
  return [
    { ...common, id: 501, glossaryEntryId: 101, lemma: "stay in sync with", meaningJa: "〜と同期した状態を保つ", source: "glossary", surface: "stay in sync with" },
    { ...common, id: 502, glossaryEntryId: null, lemma: "effect", meaningJa: "結果、効果", source: "dictionary", surface: "Effects" },
    { ...common, id: 503, glossaryEntryId: 101, lemma: "stay in sync with", meaningJa: "〜と同期した状態を保つ", source: "glossary", surface: "stay in sync with" },
    { ...common, id: 504, glossaryEntryId: null, lemma: "effect", meaningJa: "結果、効果", source: "dictionary", surface: "Effect" },
    { ...common, id: 505, glossaryEntryId: null, lemma: "paradigm", meaningJa: null, source: "glossary", surface: "paradigm" },
  ]
}

/**
 * 解答中・結果の形のブロック（segments を除く）
 */
export const EXPECTED_BLOCKS_WITHOUT_SEGMENTS = [
  { lang: null, paragraphNumber: null, text: PASSAGE_BLOCKS[0]?.text, translationJa: "エフェクトによる同期", type: "heading" },
  { lang: null, paragraphNumber: 1, text: PASSAGE_BLOCKS[1]?.text, translationJa: PASSAGE_BLOCKS[1]?.translationJa, type: "paragraph" },
  { lang: null, paragraphNumber: 2, text: PASSAGE_BLOCKS[2]?.text, translationJa: PASSAGE_BLOCKS[2]?.translationJa, type: "paragraph" },
  { lang: "jsx", paragraphNumber: null, text: PASSAGE_BLOCKS[3]?.text, translationJa: null, type: "code" },
  { lang: null, paragraphNumber: 3, text: PASSAGE_BLOCKS[4]?.text, translationJa: PASSAGE_BLOCKS[4]?.translationJa, type: "paragraph" },
]

/**
 * 解答中の形の設問（正解・解説・根拠を持たない）
 */
export const EXPECTED_QUESTIONS = QUESTION_ITEMS.map((item, index) => ({
  id: 201 + index,
  choices: item.choices,
  orderIndex: index,
  prompt: item.prompt,
  type: item.type,
}))

/**
 * 結果の形の用語集（語義設問の対象語句 102 も含む）
 */
export const EXPECTED_FULL_GLOSSARY = buildGlossaryEntries().map((entry) => ({
  id: entry.id,
  lemma: entry.lemma,
  meaningJa: entry.meaningJa,
  noteJa: entry.noteJa,
  partOfSpeech: entry.partOfSpeech,
  surface: entry.surface,
}))

/**
 * 根拠のセグメントの範囲（用語集を全件使って分割したとき）。
 * 設問 201・203 は第 1 段落（Effects〜paradigm. / Effects〜escape hatch）、202 は第 2 段落（it〜Effect）
 */
export const EXPECTED_EVIDENCES = [
  { blockIndex: 1, quote: "Effects are an escape hatch from the React paradigm.", segmentEnd: 31, segmentStart: 15 },
  { blockIndex: 2, quote: "it belongs in an event handler, not in an Effect", segmentEnd: 45, segmentStart: 25 },
  { blockIndex: 1, quote: "Effects are an escape hatch", segmentEnd: 22, segmentStart: 15 },
]

/**
 * buildSubmittedAttempt・buildStoredAnswers・buildStoredWordLookups から作った結果の形
 */
export const buildExpectedSubmittedView = () => ({
  id: 301,
  attribution: EXPECTED_ATTRIBUTION,
  blocks: EXPECTED_BLOCKS_WITHOUT_SEGMENTS.map((block) => ({ ...block, segments: expect.any(Array) })),
  correctCount: 1,
  elapsedSeconds: 150,
  glossary: EXPECTED_FULL_GLOSSARY,
  isOvertime: false,
  listenedBlockCount: 1,
  passage: { id: 1, difficulty: 2, title: "Synchronizing with Effects", wordCount: 60 },
  questionCount: 3,
  questions: QUESTION_ITEMS.map((item, index) => ({
    ...EXPECTED_QUESTIONS[index],
    correctChoiceIndex: item.correctChoiceIndex,
    evidence: EXPECTED_EVIDENCES[index],
    explanationJa: item.explanationJa,
    isAnswerKeyChanged: false,
    isCorrect: index === 0,
    selectedChoiceIndex: [1, 0, null][index],
  })),
  startedAt: new Date("2026-10-12T10:00:00.000Z"),
  status: "submitted",
  studyDate: "2026-10-13",
  submittedAt: FIXED_NOW,
  timeLimitSeconds: 180,
  translatedBlockCount: 2,
  wordLookupCount: 3,
  /**
   * 用語集 101 と辞書の effect の 2 回目は除き、用語集が消された paradigm は見出し語で残す
   */
  wordLookups: [
    { lemma: "stay in sync with", meaningJa: "〜と同期した状態を保つ", source: "glossary", surface: "stay in sync with" },
    { lemma: "effect", meaningJa: "結果、効果", source: "dictionary", surface: "Effects" },
    { lemma: "paradigm", meaningJa: null, source: "glossary", surface: "paradigm" },
  ],
  /**
   * 60 語 ÷ 150 秒 × 60
   */
  wordsPerMinute: 24,
})
