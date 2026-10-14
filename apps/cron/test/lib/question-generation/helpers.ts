import type { PassageBlock } from "@repo/domain"

import type { GeneratedQuestion, GenerateQuestionsOutput } from "../../../src/prompt"
import { type PassageFixture, readPassageFixture } from "../../prompt/helpers"

/**
 * test/fixtures/prompt/retrying-requests.json（149 語 → 3 問）。ブロックは
 * 0: heading / 1〜2: paragraph（段落 1〜2）/ 3〜4: list_item（段落 3〜4）/ 5: code / 6: quote（段落 5）
 */
export const PASSAGE: PassageFixture = readPassageFixture("retrying-requests.json")

/**
 * code 以外のブロックの index
 */
export const PROSE_BLOCK_INDEXES = PASSAGE.blocks.flatMap((block: PassageBlock, index) => (block.type === "code" ? [] : [index]))

export const buildQuestion = (overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion => ({
  choices: [
    "To explain when automatic retries are safe and how they work",
    "To list the HTTP status codes that a server can return",
    "To describe how to charge a credit card twice",
    "To compare the performance of two HTTP clients",
  ],
  correctChoiceIndex: 0,
  evidence: { blockIndex: 2, quote: "Retries are only safe when a request is idempotent" },
  explanationJa: "第 2 段落で、リトライが安全なのは冪等なリクエストだけだと説明している。",
  prompt: "What is the main purpose of this passage?",
  type: "main_idea",
  vocabularyTarget: null,
  ...overrides,
})

/**
 * 生成モデルの出力の例（validateGeneratedOutput に合格する）。
 * 用語集の "jitters" は本文に無い（本文は "jitter"）ので捨てられる
 */
export const buildGeneratedOutput = (overrides: Partial<GenerateQuestionsOutput> = {}): GenerateQuestionsOutput => ({
  difficulty: 2,
  glossary: [
    { blockIndex: 1, lemma: "opt in to", meaningJa: "〜を選んで有効にする", noteJa: null, partOfSpeech: "句動詞", surface: "opt in to" },
    {
      blockIndex: 2,
      lemma: "idempotent",
      meaningJa: "冪等な",
      noteJa: "何度実行しても結果が同じになる性質",
      partOfSpeech: "形容詞",
      surface: "idempotent",
    },
    { blockIndex: 2, lemma: "under the hood", meaningJa: "内部では", noteJa: null, partOfSpeech: "熟語", surface: "Under the hood" },
    { blockIndex: 4, lemma: "jitter", meaningJa: "揺らぎ", noteJa: null, partOfSpeech: "名詞", surface: "jitters" },
    { blockIndex: 6, lemma: "caveat", meaningJa: "注意点", noteJa: "", partOfSpeech: "名詞", surface: "caveat" },
  ],
  isSuitable: true,
  questions: [
    buildQuestion(),
    buildQuestion({
      choices: [
        "fast enough to run on every request",
        "safe to repeat because repeating it has the same effect",
        "rejected by the server when sent twice",
        "only available for POST requests",
      ],
      correctChoiceIndex: 1,
      evidence: { blockIndex: 2, quote: "sending it twice has the same effect as sending it once" },
      explanationJa: "直後で「2 回送っても 1 回と同じ効果」と言い換えている。",
      prompt: "The word \"idempotent\" in paragraph 2 is closest in meaning to ...",
      type: "vocabulary",
      vocabularyTarget: { blockIndex: 2, surface: "idempotent" },
    }),
    buildQuestion({
      choices: [
        "They are retried with exponential backoff.",
        "They are retried with random jitter.",
        "They are returned right away.",
        "They are converted into 5xx errors.",
      ],
      correctChoiceIndex: 2,
      evidence: { blockIndex: 6, quote: "4xx errors are returned right away" },
      explanationJa: "引用のブロックで、4xx はすぐに返されると書かれている。",
      prompt: "According to the passage, what happens to 4xx errors?",
      type: "detail",
    }),
  ],
  translations: [
    { blockIndex: 0, translationJa: "リトライと冪等性" },
    { blockIndex: 1, translationJa: "ネットワークの呼び出しは、コードとは無関係な多くの理由で失敗する。" },
    { blockIndex: 2, translationJa: "リトライが安全なのは、リクエストが冪等なときだけだ。" },
    { blockIndex: 3, translationJa: "試行のたびに待ち時間を少しずつ長くする（指数バックオフ）。" },
    { blockIndex: 4, translationJa: "何千ものクライアントが同時にリトライしないよう、ランダムなジッターを加える。" },
    { blockIndex: 6, translationJa: "注意点：リトライで誤ったリクエストは直せないので、4xx エラーはすぐに返される。" },
  ],
  unsuitableReason: null,
  ...overrides,
})

/**
 * 呼ぶたびに values を順に返す乱数（最後まで使ったら先頭に戻る）
 */
export const createSequenceRandom = (values: number[]): (() => number) => {
  let index = 0
  return () => {
    const value = values[index % values.length]
    index++
    return value
  }
}
