import type { PassageBlock } from "@repo/domain"

import { convertChoiceIndexToLetter } from "../lib/question-generation/choice-letter"

import { buildPassagePrompt } from "./passage"

/**
 * 解答キーを見ない検証の指示。全件共通なのでキャッシュする（短くて最小キャッシュ長に届かなければキャッシュされないだけ）。
 * 日時・件数・本文など毎回変わる値を入れない
 */
export const VERIFY_QUESTIONS_SYSTEM_PROMPT = `You are taking an English reading-comprehension test. Each request contains one passage from English technical documentation and multiple-choice questions about it. Read the passage carefully and, for each question, choose the one choice that the passage best supports.

# Input

The passage is given as XML:

<passage title="..." word_count="...">
<block index="0" type="heading">...</block>
<block index="1" type="paragraph" paragraph="1">...</block>
<block index="2" type="code" lang="js" translate="no">...</block>
</passage>

- paragraph: the paragraph number. When a question mentions a paragraph (e.g. "in paragraph 2"), it means the block with that paragraph attribute, not the index attribute.
- Inline code is wrapped in backquotes. The text is raw: characters such as < and & are not escaped.

The questions follow the passage:

<questions>
<question number="1">
<prompt>...</prompt>
<choice letter="A">...</choice>
<choice letter="B">...</choice>
<choice letter="C">...</choice>
<choice letter="D">...</choice>
</question>
</questions>

# Answering

- Base each answer on what the passage says, not on general knowledge.
- Answer every question with exactly one choice, even when you are unsure: pick the most likely one.
- For each question, return questionNumber (the number attribute of <question>) and choiceIndex (0 for A, 1 for B, 2 for C, 3 for D).`

/**
 * 検証モデルに渡す設問。正解・解説・根拠は渡さない
 */
export type VerifyQuestionsPromptQuestion = {
  /**
   * シャッフル後の 4 つ（表示順の A〜D）
   */
  choices: string[]
  prompt: string
}

export type VerifyQuestionsPromptInput = {
  blocks: PassageBlock[]
  questions: VerifyQuestionsPromptQuestion[]
  title: string
  wordCount: number
}

/**
 * 解答キーを見ない検証の user message。生成と同じ形の番号つきブロック（和訳なし）と、シャッフル後の設問・選択肢（A〜D）を並べる。
 * 設問文と選択肢は本文と同じくエスケープしない
 */
export const buildVerifyQuestionsUserContent = (input: VerifyQuestionsPromptInput): string => {
  const questionElements = input.questions.map((question, index) =>
    [
      `<question number="${index + 1}">`,
      `<prompt>${question.prompt}</prompt>`,
      ...question.choices.map((choice, choiceIndex) => `<choice letter="${convertChoiceIndexToLetter(choiceIndex)}">${choice}</choice>`),
      "</question>",
    ].join("\n"),
  )
  return [
    buildPassagePrompt({ blocks: input.blocks, title: input.title, wordCount: input.wordCount }),
    ["<questions>", ...questionElements, "</questions>"].join("\n"),
    `Answer all ${input.questions.length} questions.`,
  ].join("\n\n")
}
