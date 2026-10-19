import { findSurfaceRange, type PassageBlock, type PassageDifficulty, type QuestionType } from "@repo/domain"
import type { ApiErrorDetail } from "@repo/errors"

import type { AdminPassageDetail, DraftEditContent } from "../repository"

import { formatBlockLabel, joinBlockLabel } from "./passage-block-label"

/**
 * 下書きの保存の入力（PUT /api/admin/passage/:id のリクエストを camelCase にしたもの）。
 * ブロックは英文と和訳だけ、用語集は位置を持たず、設問の対象の語句は同じ入力の glossary の index で指す
 */
export type AdminPassageEditInput = {
  blocks: { text: string; translationJa: string | null }[]
  difficulty: PassageDifficulty
  glossary: {
    id: number | null
    blockIndex: number
    lemma: string
    meaningJa: string
    noteJa: string | null
    partOfSpeech: string | null
    surface: string
  }[]
  questions: {
    id: number | null
    choices: string[]
    choicesJa: string[] | null
    correctChoiceIndex: number
    evidenceBlockIndex: number
    evidenceQuote: string
    explanationJa: string
    prompt: string
    promptJa: string | null
    targetGlossaryIndex: number | null
    type: QuestionType
  }[]
  timeLimitSeconds: number
  title: string
}

export type BuildDraftEditContentResult =
  | { content: DraftEditContent; ok: true }
  | { details: ApiErrorDetail[]; ok: false }

/**
 * 空白だけの文字列は null にする（補足・品詞の未入力）
 */
const convertBlankToNull = (value: string | null): string | null =>
  (value === null || value.trim().length === 0 ? null : value)

/**
 * 4 つとも空白だけの選択肢の和訳は null にする（未入力）。一部だけ空白なら途中の状態としてそのまま残す（公開の検査で見る）
 */
const convertBlankChoiceTranslationsToNull = (translations: string[] | null): string[] | null =>
  (translations === null || translations.every((translation) => translation.trim().length === 0) ? null : translations)

/**
 * ブロックの種類と言語は保存済みのまま、英文と和訳だけを入れ替える。code と、空白だけの和訳は和訳を持たない
 */
const buildBlocks = (existingBlocks: PassageBlock[], input: AdminPassageEditInput["blocks"]): PassageBlock[] =>
  existingBlocks.map((existing, index) => {
    const edited = input[index]
    const block: PassageBlock = { text: edited.text, type: existing.type }
    if (existing.lang !== undefined) block.lang = existing.lang
    const translationJa = convertBlankToNull(edited.translationJa)
    if (existing.type !== "code" && translationJa !== null) block.translationJa = translationJa
    return block
  })

/**
 * id が保存済みのものか（保存済みの id の集合にあり、入力の中で重複しない）を検査し、不合格の項目を返す。id が null（新規）は検査しない
 */
const checkExistingIds = (
  items: { id: number | null }[],
  existingIds: Set<number>,
  target: { codePrefix: "glossary" | "question"; formatLabel: (index: number) => string; pathKey: "glossary" | "questions" },
): ApiErrorDetail[] => {
  const details: ApiErrorDetail[] = []
  const seenIds = new Set<number>()
  items.forEach((item, index) => {
    if (item.id === null) return
    if (!existingIds.has(item.id)) {
      details.push({
        code: `${target.codePrefix}_id_not_found`,
        message: `${target.formatLabel(index)}：保存済みの項目ではありません`,
        path: [target.pathKey, index, "id"],
      })
    } else if (seenIds.has(item.id)) {
      details.push({
        code: `${target.codePrefix}_id_duplicated`,
        message: `${target.formatLabel(index)}：同じ項目が 2 回指定されています`,
        path: [target.pathKey, index, "id"],
      })
    }
    seenIds.add(item.id)
  })
  return details
}

/**
 * 保存のリクエストを DraftEditContent にする。
 *
 * - ブロック：数は変えられない。type / lang は保存済みのまま、code の和訳は持たない
 * - 用語集：新しい英文に対して findSurfaceRange で位置を求め直す（見つからなければ glossary_surface_not_found）。
 *   code のブロックは指せない（cron の生成と同じく、用語集は文章のブロックだけ）
 * - 設問：配列の順を orderIndex にする。vocabulary 以外の対象の語句は null。根拠は位置を持たない列なので、引用をそのまま保存する（公開時に検査）
 * - id は保存済みのものだけを受け付ける（設問・用語集とも）
 *
 * 途中の状態（空の選択肢・解説・和訳）は不合格にしない。正しさは公開の検査（listPublishViolations）で見る
 */
export const buildDraftEditContent = (
  detail: AdminPassageDetail,
  input: AdminPassageEditInput,
): BuildDraftEditContentResult => {
  const existingBlocks = detail.passage.blocks
  if (input.blocks.length !== existingBlocks.length) {
    return {
      details: [{
        code: "block_count_mismatch",
        message: `ブロックの数は変えられません（保存済みは ${existingBlocks.length} 個）`,
        path: ["blocks"],
      }],
      ok: false,
    }
  }
  const blocks = buildBlocks(existingBlocks, input.blocks)

  const details: ApiErrorDetail[] = [
    ...checkExistingIds(input.glossary, new Set(detail.glossary.map((entry) => entry.id)), {
      codePrefix: "glossary",
      formatLabel: (index) => `用語集「${input.glossary[index]?.surface ?? ""}」`,
      pathKey: "glossary",
    }),
    ...checkExistingIds(input.questions, new Set(detail.questions.map((question) => question.id)), {
      codePrefix: "question",
      formatLabel: (index) => `Q${index + 1}`,
      pathKey: "questions",
    }),
  ]

  const glossary: DraftEditContent["glossary"] = []
  input.glossary.forEach((entry, index) => {
    const entryLabel = `用語集「${entry.surface}」`
    const block: PassageBlock | undefined = blocks[entry.blockIndex]
    if (!block) {
      details.push({
        code: "block_index_out_of_range",
        message: `${entryLabel}：${formatBlockLabel(blocks, entry.blockIndex)}はありません`,
        path: ["glossary", index, "block_index"],
      })
      return
    }
    const range = block.type === "code" ? null : findSurfaceRange(block.text, entry.surface)
    if (!range) {
      details.push({
        code: "glossary_surface_not_found",
        message: block.type === "code"
          ? `${entryLabel}：コードのブロックは指せません`
          : `${entryLabel}が${joinBlockLabel(formatBlockLabel(blocks, entry.blockIndex), "の本文に見つかりません")}`,
        path: ["glossary", index, "surface"],
      })
      return
    }
    glossary.push({
      id: entry.id,
      blockIndex: entry.blockIndex,
      endOffset: range.endOffset,
      lemma: entry.lemma,
      meaningJa: entry.meaningJa,
      noteJa: convertBlankToNull(entry.noteJa),
      partOfSpeech: convertBlankToNull(entry.partOfSpeech),
      startOffset: range.startOffset,
      surface: entry.surface,
    })
  })

  const questions: DraftEditContent["questions"] = input.questions.map((question, index) => {
    const targetGlossaryIndex = question.type === "vocabulary" ? question.targetGlossaryIndex : null
    if (targetGlossaryIndex !== null && targetGlossaryIndex >= input.glossary.length) {
      details.push({
        code: "target_glossary_index_out_of_range",
        message: `Q${index + 1}：対象の語句が用語集にありません`,
        path: ["questions", index, "target_glossary_index"],
      })
    }
    return {
      id: question.id,
      choices: question.choices,
      /**
       * 語義の設問は選択肢の和訳を持たない（DB の questions_choices_ja_check）。種類を語義に変えたときに残った和訳もここで消す
       */
      choicesJa: question.type === "vocabulary" ? null : convertBlankChoiceTranslationsToNull(question.choicesJa),
      correctChoiceIndex: question.correctChoiceIndex,
      evidenceBlockIndex: question.evidenceBlockIndex,
      evidenceQuote: question.evidenceQuote,
      explanationJa: question.explanationJa,
      orderIndex: index,
      prompt: question.prompt,
      promptJa: convertBlankToNull(question.promptJa),
      targetGlossaryIndex,
      type: question.type,
    }
  })

  if (details.length > 0) return { details, ok: false }
  return {
    content: {
      blocks,
      difficulty: input.difficulty,
      glossary,
      questions,
      timeLimitSeconds: input.timeLimitSeconds,
      title: input.title,
    },
    ok: true,
  }
}
