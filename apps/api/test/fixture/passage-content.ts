import { findSurfaceRange, type GlossaryEntry, type Passage, type PassageBlock, type Question } from "@repo/domain"

import type { AdminPassageEditInput } from "../../src/lib/admin-passage-edit"
import type { AdminPassageDetail } from "../../src/repository"

/**
 * 問題の本文・用語集・設問のテスト用の値（DB を使わない）。公開の条件をすべて満たす。
 * lib / service のユニットテストと、test/fixture/passage.ts（DB への投入）が共有する
 */

export const PASSAGE_BLOCKS: PassageBlock[] = [
  { text: "Synchronizing with Effects", translationJa: "エフェクトによる同期", type: "heading" },
  {
    text: "Some components need to stay in sync with external systems. Effects are an escape hatch from the React paradigm.",
    translationJa: "コンポーネントの中には外部のシステムと同期し続ける必要があるものがあります。エフェクトは React のパラダイムからの避難口です。",
    type: "paragraph",
  },
  {
    text: "If a piece of logic runs because the user clicked a button, it belongs in an event handler, not in an Effect.",
    translationJa: "ユーザーがボタンをクリックしたために実行されるロジックなら、エフェクトではなくイベントハンドラに書くべきです。",
    type: "paragraph",
  },
  { lang: "jsx", text: "useEffect(() => {\n  connect()\n}, [])", type: "code" },
  {
    text: "You can opt out of re-running an Effect by specifying a dependency array.",
    translationJa: "依存配列を指定すると、エフェクトの再実行をやめられます。",
    type: "paragraph",
  },
]

export type GlossaryItem = Pick<GlossaryEntry, "blockIndex" | "lemma" | "meaningJa" | "noteJa" | "partOfSpeech" | "surface">

/**
 * 位置を持たない用語集の項目（位置は本文から findSurfaceRange で求める）
 */
export const GLOSSARY_ITEMS: GlossaryItem[] = [
  {
    blockIndex: 1,
    lemma: "stay in sync with",
    meaningJa: "〜と同期した状態を保つ",
    noteJa: null,
    partOfSpeech: "熟語",
    surface: "stay in sync with",
  },
  {
    blockIndex: 1,
    lemma: "escape hatch",
    meaningJa: "（通常の仕組みから）必要なときに抜け出すための手段",
    noteJa: "技術文書では「逃げ道」の意味でよく使う",
    partOfSpeech: "名詞",
    surface: "escape hatch",
  },
  {
    blockIndex: 4,
    lemma: "opt out of",
    meaningJa: "〜をやめる、（既定の動作を）無効にする",
    noteJa: null,
    partOfSpeech: "熟語",
    surface: "opt out of",
  },
]

export type QuestionItem = Pick<
  Question,
  | "choices"
  | "choicesJa"
  | "correctChoiceIndex"
  | "evidenceBlockIndex"
  | "evidenceQuote"
  | "explanationJa"
  | "prompt"
  | "promptJa"
  | "type"
  | "verificationChoiceIndex"
> & {
  /**
   * GLOSSARY_ITEMS の index（vocabulary だけ）
   */
  targetGlossaryIndex: number | null
}

export const QUESTION_ITEMS: QuestionItem[] = [
  {
    choices: [
      "To explain how React compares dependencies",
      "To describe when Effects are appropriate",
      "To argue that Effects should never be used",
      "To introduce third-party widgets",
    ],
    choicesJa: [
      "React が依存配列をどう比べるかを説明するため",
      "エフェクトが適している場面を説明するため",
      "エフェクトを決して使うべきでないと主張するため",
      "サードパーティのウィジェットを紹介するため",
    ],
    correctChoiceIndex: 1,
    evidenceBlockIndex: 1,
    evidenceQuote: "Effects are an escape hatch from the React paradigm.",
    explanationJa: "本文はエフェクトを使うべき場面を説明しています。",
    prompt: "What is the main purpose of this passage?",
    promptJa: "この文章の主な目的は何か。",
    targetGlossaryIndex: null,
    type: "main_idea",
    verificationChoiceIndex: 1,
  },
  {
    choices: [
      "In an Effect with an empty dependency array",
      "In the cleanup function of an Effect",
      "In an event handler",
      "In a separate state variable",
    ],
    choicesJa: ["依存配列が空のエフェクトの中", "エフェクトのクリーンアップ関数の中", "イベントハンドラの中", "別の state 変数の中"],
    correctChoiceIndex: 2,
    evidenceBlockIndex: 2,
    evidenceQuote: "it belongs in an event handler, not in an Effect",
    explanationJa: "第 2 段落にイベントハンドラに書くべきとあります。",
    prompt: "Where should logic that runs because the user clicked a button be placed?",
    promptJa: "ユーザーがボタンをクリックしたために実行されるロジックはどこに置くべきか。",
    targetGlossaryIndex: null,
    type: "detail",
    verificationChoiceIndex: 2,
  },
  {
    choices: [
      "a security vulnerability",
      "a way to leave the usual system when it is needed",
      "a shortcut that improves performance",
      "a feature that is no longer recommended",
    ],
    choicesJa: null,
    correctChoiceIndex: 1,
    evidenceBlockIndex: 1,
    evidenceQuote: "Effects are an escape hatch",
    explanationJa: "escape hatch は通常の仕組みから抜け出す手段を指します。",
    prompt: "In paragraph 1, the phrase \"escape hatch\" is closest in meaning to",
    promptJa: "第 1 段落の \"escape hatch\" に最も意味が近いものはどれか。",
    targetGlossaryIndex: 1,
    type: "vocabulary",
    verificationChoiceIndex: 0,
  },
]

const FIXED_DATE = new Date("2026-10-12T03:00:00.000Z")

/**
 * 用語集の項目の位置を本文から求める（見つからなければテストの値の誤りなので throw する）
 */
export const locateGlossaryItem = (
  blocks: PassageBlock[],
  item: Pick<GlossaryItem, "blockIndex" | "surface">,
): { endOffset: number; startOffset: number } => {
  const range = findSurfaceRange(blocks[item.blockIndex]?.text ?? "", item.surface)
  if (!range) throw new Error(`Surface not found in fixture: ${item.surface}`)
  return range
}

export const buildPassage = (overrides: Partial<Passage> = {}): Passage => ({
  id: 1,
  attentionReasons: [],
  blocks: PASSAGE_BLOCKS,
  contentHash: "content-hash-1",
  difficulty: 2,
  generatedAt: FIXED_DATE,
  generationAttemptCount: 0,
  generationError: null,
  generationModel: "claude-sonnet-5-5",
  generationPromptVersion: "2026-10-13",
  generationStartedAt: FIXED_DATE,
  needsAttention: false,
  publishedAt: null,
  rejectReason: null,
  reviewedAt: null,
  sourceCommitSha: "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b",
  sourceDocumentId: 1,
  sourcePath: "src/content/learn/synchronizing-with-effects.md",
  sourceRetrievedAt: FIXED_DATE,
  status: "draft",
  timeLimitSeconds: 180,
  title: "Synchronizing with Effects",
  wordCount: 60,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
  ...overrides,
})

/**
 * GLOSSARY_ITEMS を位置つきの用語集にする（id は 101 から）
 */
export const buildGlossaryEntries = (passageId = 1): GlossaryEntry[] =>
  GLOSSARY_ITEMS.map((item, index) => ({
    id: 101 + index,
    ...item,
    ...locateGlossaryItem(PASSAGE_BLOCKS, item),
    passageId,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  }))

/**
 * QUESTION_ITEMS を設問にする（id は 201 から。対象の語句は glossary の id を指す）
 */
export const buildQuestions = (glossary: GlossaryEntry[], passageId = 1): Question[] =>
  QUESTION_ITEMS.map(({ targetGlossaryIndex, ...item }, index) => ({
    id: 201 + index,
    ...item,
    orderIndex: index,
    passageId,
    targetGlossaryEntryId: targetGlossaryIndex === null ? null : glossary[targetGlossaryIndex]?.id ?? null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  }))

/**
 * 公開の条件をすべて満たす下書きの詳細
 */
export const buildAdminPassageDetail = (overrides: Partial<AdminPassageDetail> = {}): AdminPassageDetail => {
  const glossary = buildGlossaryEntries()
  return {
    attemptCount: 0,
    audio: null,
    glossary,
    passage: buildPassage(),
    questions: buildQuestions(glossary),
    source: { id: 1, name: "React 公式ドキュメント" },
    ...overrides,
  }
}

/**
 * 詳細をそのまま保存し直す入力（何も変えない保存）
 */
export const buildEditInput = (detail: AdminPassageDetail): AdminPassageEditInput => ({
  blocks: detail.passage.blocks.map((block) => ({ text: block.text, translationJa: block.translationJa ?? null })),
  difficulty: detail.passage.difficulty ?? 2,
  glossary: detail.glossary.map((entry) => ({
    id: entry.id,
    blockIndex: entry.blockIndex,
    lemma: entry.lemma,
    meaningJa: entry.meaningJa,
    noteJa: entry.noteJa,
    partOfSpeech: entry.partOfSpeech,
    surface: entry.surface,
  })),
  questions: detail.questions.map((question) => ({
    id: question.id,
    choices: question.choices,
    choicesJa: question.choicesJa,
    correctChoiceIndex: question.correctChoiceIndex,
    evidenceBlockIndex: question.evidenceBlockIndex,
    evidenceQuote: question.evidenceQuote,
    explanationJa: question.explanationJa,
    prompt: question.prompt,
    promptJa: question.promptJa,
    targetGlossaryIndex: question.targetGlossaryEntryId === null
      ? null
      : detail.glossary.findIndex((entry) => entry.id === question.targetGlossaryEntryId),
    type: question.type,
  })),
  timeLimitSeconds: detail.passage.timeLimitSeconds ?? 180,
  title: detail.passage.title,
})
