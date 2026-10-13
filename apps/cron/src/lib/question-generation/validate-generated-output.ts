import { calculateQuestionCount, type PassageBlock } from "@repo/domain"

import { type GenerateQuestionsOutput, generateQuestionsOutputSchema } from "../../prompt"

export type ValidateGeneratedOutputResult =
  | { ok: true; output: GenerateQuestionsOutput }
  | { errors: string[]; ok: false }

/**
 * Zod の issue を「path: message」の 1 行にする。path が空（ルート）なら message だけ
 */
const formatIssue = (issue: { message: string; path: PropertyKey[] }): string =>
  issue.path.length === 0 ? issue.message : `${issue.path.map(String).join(".")}: ${issue.message}`

/**
 * 前後の空白を除いて小文字にした選択肢に重複があるか
 */
const hasDuplicateChoices = (choices: string[]): boolean =>
  new Set(choices.map((choice) => choice.trim().toLowerCase())).size !== choices.length

/**
 * blockIndex が本文のブロックを指していて、code ブロックでないかを検査し、不合格の理由を返す（合格なら null）
 */
const checkProseBlockIndex = (path: string, blockIndex: number, blocks: PassageBlock[]): string | null => {
  const block: PassageBlock | undefined = blocks[blockIndex]
  if (!block) {
    return `${path}: block ${blockIndex} does not exist (the passage has blocks 0-${blocks.length - 1})`
  }
  if (block.type === "code") return `${path}: block ${blockIndex} is a code block; refer to a block of prose`
  return null
}

/**
 * LLM の出力が保存できる形かを検査する。不合格の理由は英語で、そのまま再生成の指示（retryErrors）に使う。
 *
 * - Zod（`generateQuestionsOutputSchema`）に合う
 * - `isSuitable = false` なら以降を検査せず合格（task が却下にする）
 * - 設問数が `calculateQuestionCount(wordCount)` と一致する
 * - 各設問の選択肢が、前後の空白を除いて小文字にしても重複しない
 * - 根拠と `vocabularyTarget` の blockIndex が範囲内で、code ブロックでない
 *
 * 根拠の引用が本文に無い・和訳の欠け・用語集の語句が見つからないなどは不合格にせず、`buildDraftContent` が要確認の理由にする
 */
export const validateGeneratedOutput = (
  json: unknown,
  passage: { blocks: PassageBlock[]; wordCount: number },
): ValidateGeneratedOutputResult => {
  const parsed = generateQuestionsOutputSchema.safeParse(json)
  if (!parsed.success) return { errors: parsed.error.issues.map(formatIssue), ok: false }
  const output = parsed.data
  if (!output.isSuitable) return { ok: true, output }

  const errors: string[] = []
  const expectedQuestionCount = calculateQuestionCount(passage.wordCount)
  if (output.questions.length !== expectedQuestionCount) {
    errors.push(`questions: expected ${expectedQuestionCount} questions but got ${output.questions.length}`)
  }
  output.questions.forEach((question, index) => {
    if (hasDuplicateChoices(question.choices)) {
      errors.push(`questions.${index}.choices: choices must be distinct (ignoring case and surrounding spaces)`)
    }
    const evidenceError = checkProseBlockIndex(
      `questions.${index}.evidence.blockIndex`,
      question.evidence.blockIndex,
      passage.blocks,
    )
    if (evidenceError) errors.push(evidenceError)
    if (question.vocabularyTarget) {
      const targetError = checkProseBlockIndex(
        `questions.${index}.vocabularyTarget.blockIndex`,
        question.vocabularyTarget.blockIndex,
        passage.blocks,
      )
      if (targetError) errors.push(targetError)
    }
  })
  return errors.length === 0 ? { ok: true, output } : { errors, ok: false }
}
