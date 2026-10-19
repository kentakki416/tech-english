import {
  hasQuote,
  isSurfaceAt,
  MAX_QUESTIONS_PER_PASSAGE,
  MIN_QUESTIONS_PER_PASSAGE,
  type PassageBlock,
  QUESTION_CHOICE_COUNT,
} from "@repo/domain"
import type { ApiErrorDetail } from "@repo/errors"

import type { AdminPassageDetail } from "../repository"

import { formatBlockLabel, joinBlockLabel } from "./passage-block-label"

/**
 * 選択肢がちょうど 4 つで、空が無く、重複しない（前後の空白を除き小文字で比較）
 */
const hasValidChoices = (choices: string[]): boolean => {
  if (choices.length !== QUESTION_CHOICE_COUNT) return false
  const normalized = choices.map((choice) => choice.trim().toLowerCase())
  return normalized.every((choice) => choice.length > 0) && new Set(normalized).size === normalized.length
}

/**
 * 正解の選択肢の位置が 0〜3 か
 */
const isCorrectChoiceIndex = (index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < QUESTION_CHOICE_COUNT

/**
 * 空白だけの文字列も空とみなす
 */
const isBlank = (value: string | null | undefined): boolean => (value ?? "").trim().length === 0

/**
 * 選択肢の和訳が 4 つそろい、空白だけのものが無い
 */
const hasChoiceTranslations = (choicesJa: string[] | null): boolean =>
  choicesJa !== null && choicesJa.length === QUESTION_CHOICE_COUNT && choicesJa.every((choice) => !isBlank(choice))

/**
 * 公開の条件（docs/spec/question-generation/README.md の「出力の検証と後処理」）を満たさない項目を返す。空なら公開できる。
 * cron の生成時の検査と同じ判定を @repo/domain の関数で行い、admin が修正で壊した場合を防ぐ。
 * message の段落の表記は numberParagraphs（「Q2：根拠の引用が段落 2 の本文に見つかりません」）
 */
export const listPublishViolations = (detail: AdminPassageDetail): ApiErrorDetail[] => {
  const { glossary, passage, questions } = detail
  const blocks: PassageBlock[] = passage.blocks
  const violations: ApiErrorDetail[] = []

  if (questions.length < MIN_QUESTIONS_PER_PASSAGE || questions.length > MAX_QUESTIONS_PER_PASSAGE) {
    violations.push({
      code: "question_count_out_of_range",
      message: `設問は ${MIN_QUESTIONS_PER_PASSAGE}〜${MAX_QUESTIONS_PER_PASSAGE} 問にしてください（現在 ${questions.length} 問）`,
      path: ["questions"],
    })
  }

  const glossaryIds = new Set(glossary.map((entry) => entry.id))
  questions.forEach((question, index) => {
    const questionLabel = `Q${index + 1}`
    if (isBlank(question.prompt)) {
      violations.push({
        code: "prompt_empty",
        message: `${questionLabel}：設問文が空です`,
        path: ["questions", index, "prompt"],
      })
    }
    if (isBlank(question.promptJa)) {
      violations.push({
        code: "prompt_translation_missing",
        message: `${questionLabel}：設問文の和訳が空です`,
        path: ["questions", index, "prompt_ja"],
      })
    }
    if (!hasValidChoices(question.choices)) {
      violations.push({
        code: "choice_invalid",
        message: `${questionLabel}：選択肢は ${QUESTION_CHOICE_COUNT} つとも入力し、重複しないようにしてください`,
        path: ["questions", index, "choices"],
      })
    }
    if (question.type !== "vocabulary" && !hasChoiceTranslations(question.choicesJa)) {
      violations.push({
        code: "choice_translation_missing",
        message: `${questionLabel}：選択肢の和訳を ${QUESTION_CHOICE_COUNT} つとも入力してください`,
        path: ["questions", index, "choices_ja"],
      })
    }
    if (!isCorrectChoiceIndex(question.correctChoiceIndex)) {
      violations.push({
        code: "correct_choice_missing",
        message: `${questionLabel}：正解の選択肢を選んでください`,
        path: ["questions", index, "correct_choice_index"],
      })
    }
    if (isBlank(question.explanationJa)) {
      violations.push({
        code: "explanation_empty",
        message: `${questionLabel}：解説が空です`,
        path: ["questions", index, "explanation_ja"],
      })
    }
    const evidenceBlock: PassageBlock | undefined = blocks[question.evidenceBlockIndex]
    if (!evidenceBlock || !hasQuote(evidenceBlock.text, question.evidenceQuote)) {
      const blockLabel = formatBlockLabel(blocks, question.evidenceBlockIndex)
      violations.push({
        code: "evidence_not_found",
        message: `${questionLabel}：根拠の引用が${joinBlockLabel(blockLabel, "の本文に見つかりません")}`,
        path: ["questions", index, "evidence"],
      })
    }
    if (
      question.type === "vocabulary"
      && (question.targetGlossaryEntryId === null || !glossaryIds.has(question.targetGlossaryEntryId))
    ) {
      violations.push({
        code: "vocabulary_target_missing",
        message: `${questionLabel}：対象の語句が用語集と紐づいていません`,
        path: ["questions", index, "target_glossary_entry_id"],
      })
    }
  })

  blocks.forEach((block, index) => {
    if (block.type === "code" || !isBlank(block.translationJa)) return
    violations.push({
      code: "translation_missing",
      message: joinBlockLabel(formatBlockLabel(blocks, index), "の和訳が空です"),
      path: ["blocks", index, "translation_ja"],
    })
  })

  glossary.forEach((entry, index) => {
    const block: PassageBlock | undefined = blocks[entry.blockIndex]
    if (!block || !isSurfaceAt(block.text, entry)) {
      violations.push({
        code: "glossary_position_mismatch",
        message: `用語集「${entry.surface}」が${joinBlockLabel(formatBlockLabel(blocks, entry.blockIndex), "の本文の位置に見つかりません")}`,
        path: ["glossary", index, "surface"],
      })
    }
    /**
     * cron は語義設問の対象が用語集に無いとき、意味が空の項目を足す（要確認にして管理者に入力させる）
     */
    if (isBlank(entry.meaningJa)) {
      violations.push({
        code: "glossary_meaning_empty",
        message: `用語集「${entry.surface}」：文脈での意味が空です`,
        path: ["glossary", index, "meaning_ja"],
      })
    }
  })

  if (passage.difficulty === null) {
    violations.push({ code: "difficulty_missing", message: "難易度が未設定です", path: ["difficulty"] })
  }
  if (passage.timeLimitSeconds === null) {
    violations.push({ code: "time_limit_missing", message: "制限時間が未設定です", path: ["time_limit_seconds"] })
  }
  return violations
}
