import {
  PASSAGE_DIFFICULTIES,
  type PassageBlock,
  type PassageDifficulty,
  QUESTION_TYPES,
  type QuestionType,
} from "@repo/domain"

import { buildPassagePrompt } from "./passage"

/**
 * プロンプト（system prompt・user message の形・出力のスキーマ）を変えたら必ず上げる。
 * 生成した問題の passages.generation_prompt_version に入り、プロンプトの改善の前後で品質を比べるのに使う
 */
export const PROMPT_VERSION = "2026-10-19"

/**
 * 設問の種類ごとの説明と例（README の「設問のルール」）。QUESTION_TYPES の全種類を持つことを型で強制する
 */
const QUESTION_TYPE_GUIDES: Record<QuestionType, string> = {
  detail: "a specific fact stated in the passage. e.g. \"According to the passage, what happens when the cache is full?\"",
  inference: "something the passage implies but does not state directly. e.g. \"What can be inferred about the previous version of the API?\"",
  main_idea: "the main point or purpose of the passage or a section. e.g. \"What is the main purpose of this section?\"",
  purpose: "why the author mentions something. e.g. \"Why does the author mention the `useEffect` hook?\"",
  vocabulary: "the meaning of a word or phrase in context. e.g. \"The phrase \"opt in\" in paragraph 2 is closest in meaning to ...\"",
}

/**
 * 難易度の目安（README の「難易度と制限時間」）
 */
const DIFFICULTY_GUIDES: Record<PassageDifficulty, string> = {
  1: "Easy: plain sentences, such as a tutorial or the introduction of a README",
  2: "Normal: typical technical documentation, such as API reference descriptions or explanations of concepts",
  3: "Hard: abstract content or long, complex sentences, such as RFCs, design discussions or precise specifications",
}

const QUESTION_TYPE_LINES = QUESTION_TYPES.map((type) => `  - ${type}: ${QUESTION_TYPE_GUIDES[type]}`).join("\n")

const DIFFICULTY_LINES = PASSAGE_DIFFICULTIES.map((difficulty) => `- ${difficulty} (${DIFFICULTY_GUIDES[difficulty]})`).join("\n")

/**
 * 全件共通の指示。キャッシュするので、日時・件数・本文など毎回変わる値を入れない（変わる値は user message に入れる）
 */
export const GENERATE_QUESTIONS_SYSTEM_PROMPT = `You write English reading-comprehension material for Japanese software engineers whose English is intermediate (around CEFR B1-B2). Each request contains one passage from English technical documentation. Read it and return one JSON object with: whether the passage is suitable as reading material, its difficulty, multiple-choice questions with Japanese translations, a Japanese translation of each block, and a glossary of difficult words and phrases with their meaning in this context.

An editor reviews everything before learners see it, and a separate model answers your questions without seeing the answer key. Correctness matters more than anything else: every question must have exactly one correct choice, and the passage must clearly support it.

# Input

The passage is given as XML:

<passage title="..." word_count="..." question_count="...">
<block index="0" type="heading">...</block>
<block index="1" type="paragraph" paragraph="1">...</block>
<block index="2" type="code" lang="js" translate="no">...</block>
</passage>

- index: the block number, starting at 0 and counting every block. Every blockIndex in your output refers to this number.
- paragraph: the paragraph number that learners see, starting at 1. Paragraphs, list items and quotes are numbered; headings and code blocks are not. When a question mentions a paragraph (e.g. "in paragraph 2"), use this number, never the block index.
- type: heading, paragraph, list_item, code or quote. Code blocks also have translate="no".
- Inline code is wrapped in backquotes, like \`useEffect\`. The text is raw: characters such as < and & are not escaped.
- Passages are excerpts split from longer documents at headings, so some missing context is normal.

# 1. Suitability

Set isSuitable to false when the passage does not work as reading material, for example:
- it is only a table of contents, a list of links or navigation text
- it is a license or other legal text
- it is mostly code with little explanatory prose
- it is cut off or depends so much on missing context that it does not make sense on its own

In that case, write a short reason in Japanese in unsuitableReason, still set difficulty, and return empty arrays for questions, translations and glossary. Otherwise set isSuitable to true and unsuitableReason to null.

# 2. Difficulty

Judge from the vocabulary, the sentence structure and how abstract the content is:
${DIFFICULTY_LINES}

# 3. Questions

- Write exactly question_count questions.
- Use at least two different types:
${QUESTION_TYPE_LINES}
- Write prompt and choices in English, and promptJa, choicesJa and explanationJa in Japanese.
- Give exactly four choices with exactly one correct answer, and set correctChoiceIndex to its 0-based position. The choices are shuffled afterwards, so the position does not matter.
- Make every wrong choice plausible: a reader who skims or relies on general knowledge should find it believable, but a careful reader can rule it out from the passage. Do not make two choices mean the same thing, and keep the choices similar in length and style so the answer does not stand out.
- Never use "All of the above", "None of the above" or any choice that refers to other choices.
- Every question must be answerable from the passage alone. Ask about the prose, not about the details of code blocks.
- explanationJa: explain why the correct choice is right and why the main wrong choices are wrong, pointing to what the passage says. Because the choices are shuffled, do not refer to them by letter or position (A, B, 1つ目 and so on); quote or paraphrase them instead.
- promptJa and choicesJa: Japanese translations for learners who cannot follow the English question. Write them the same way as the block translations (see "4. Translations"). choicesJa[i] is the translation of choices[i]. Translate each choice faithfully: do not add, drop or soften anything, so that no choice becomes more or less convincing in Japanese than in English.
- For vocabulary questions, keep the target word or phrase in English in promptJa exactly as it appears in prompt, and do not explain its meaning. Set choicesJa to null, because translated choices would give the answer away.
- evidence: the blockIndex of the block that supports the correct answer (not a code block), and quote, copied verbatim from that block's text with the same characters, capitalization, punctuation and backquotes. Quote one sentence or a meaningful part of one. Do not paraphrase, do not skip words with "...", and do not join text from different blocks.
- vocabularyTarget: only for vocabulary questions, the target word or phrase: its blockIndex and its surface exactly as written in that block. It must be null for every other type. Always add the same word or phrase to the glossary with the same blockIndex and surface.

# 4. Translations

- Translate every block except code blocks: every heading, paragraph, list item and quote. Do not skip or merge blocks.
- Write natural Japanese the way Japanese engineers actually write. Keep terms that are normally written in katakana or left in English as they are (props, デプロイ, コンポーネント) instead of forcing a translation.
- Keep inline code (text in backquotes) exactly as it is, including the backquotes. Do not translate it.
- Translate the whole block faithfully; do not summarize.

# 5. Glossary

- Pick 8 to 20 words, phrasal verbs, idioms and technical-English expressions that an intermediate (CEFR B1-B2) engineer is likely to stumble on, such as "opt out of", "idempotent", "under the hood" and "caveat".
- Skip words every learner knows (the, use, file) and identifiers in inline code. List each expression once.
- surface: the expression exactly as it appears in the block, with the same capitalization and inflection (e.g. "opted out of", not "opt out of"). blockIndex: the block where it appears. Never pick from code blocks. Do not give character positions.
- lemma: the dictionary form (e.g. "opt out of").
- partOfSpeech: one of 名詞, 動詞, 形容詞, 副詞, 前置詞, 接続詞, 句動詞, 熟語.
- meaningJa: the one meaning that fits this context, in Japanese. Do not list several dictionary senses.
- noteJa: a short note in Japanese only when it helps (e.g. 「技術文書では『〜を無効にする』の意味でよく使う」); otherwise null.`

export type GenerateQuestionsPromptInput = {
  blocks: PassageBlock[]
  /**
   * 作る設問の数（`calculateQuestionCount(wordCount)`）
   */
  questionCount: number
  /**
   * 前回の出力が不合格だった理由（1 回だけの再生成のとき）。空なら付けない
   */
  retryErrors: string[]
  title: string
  wordCount: number
}

/**
 * 問題生成の user message。番号つきブロックの本文と設問数の指示、再生成のときは前回の不合格の理由を付ける。
 * 同じ入力からは同じ文字列を作る
 */
export const buildGenerateQuestionsUserContent = (input: GenerateQuestionsPromptInput): string => {
  const sections = [
    buildPassagePrompt({
      blocks: input.blocks,
      questionCount: input.questionCount,
      title: input.title,
      wordCount: input.wordCount,
    }),
    `Create exactly ${input.questionCount} questions for this passage.`,
  ]
  if (input.retryErrors.length > 0) {
    sections.push(
      [
        "<previous_attempt_errors>",
        "Your previous output for this passage was rejected for the following reasons. Fix them and output the whole JSON object again.",
        ...input.retryErrors.map((error) => `- ${error}`),
        "</previous_attempt_errors>",
      ].join("\n"),
    )
  }
  return sections.join("\n\n")
}
