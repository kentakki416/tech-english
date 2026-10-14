import {
  calculateTimeLimitSeconds,
  findSurfaceRange,
  hasQuote,
  numberHeadings,
  numberParagraphs,
  type PassageBlock,
} from "@repo/domain"

import type { GenerateQuestionsOutput } from "../../prompt"
import type { DraftContent, DraftGlossaryEntry, DraftQuestion } from "../../repository"

import { shuffleChoices } from "./shuffle-choices"

/**
 * 生成から作る下書き。生成の記録（モデル・プロンプトの版）は service が足す
 */
export type GeneratedDraft = Omit<DraftContent, "generationModel" | "generationPromptVersion">

/**
 * 本文に見つからず捨てた用語集の語句（task がログに出す）
 */
export type DroppedGlossaryItem = {
  blockIndex: number
  surface: string
}

export type BuildDraftContentInput = {
  blocks: PassageBlock[]
  /**
   * `validateGeneratedOutput` に合格し、isSuitable = true の出力
   */
  output: GenerateQuestionsOutput
  /**
   * 選択肢のシャッフルに使う [0, 1) の乱数
   */
  random: () => number
  wordCount: number
}

export type BuildDraftContentResult = {
  content: GeneratedDraft
  droppedGlossary: DroppedGlossaryItem[]
}

/**
 * 末尾が数字の表記（「段落 2」「見出し 1」）の後ろには空白を入れて続ける（「段落 2 の本文」「コードの本文」）
 */
const joinLabel = (label: string, rest: string): string => (/\d$/.test(label) ? `${label} ${rest}` : `${label}${rest}`)

/**
 * 要確認の理由でのブロックの表記（「段落 2」「見出し 1」「コード」、範囲外は「ブロック n」）。
 * api の formatBlockLabel（公開の条件のメッセージ）と同じ規則。見出しにも番号を付け、和訳の無い見出しが複数あっても理由を区別できるようにする
 */
const createBlockLabeler = (blocks: PassageBlock[]): ((blockIndex: number) => string) => {
  const headingNumbers = numberHeadings(blocks)
  const paragraphNumbers = numberParagraphs(blocks)
  return (blockIndex) => {
    const block: PassageBlock | undefined = blocks[blockIndex]
    if (!block) return `ブロック ${blockIndex + 1}`
    if (block.type === "heading") return `見出し ${headingNumbers[blockIndex]}`
    if (block.type === "code") return "コード"
    return `段落 ${paragraphNumbers[blockIndex]}`
  }
}

/**
 * code 以外のブロックから surface を探して位置を返す。ブロックが無い・code・見つからないときは null
 */
const findProseSurfaceRange = (
  blocks: PassageBlock[],
  blockIndex: number,
  surface: string,
): { endOffset: number; startOffset: number } | null => {
  const block: PassageBlock | undefined = blocks[blockIndex]
  if (!block || block.type === "code") return null
  return findSurfaceRange(block.text, surface)
}

const buildPositionKey = (entry: Pick<DraftGlossaryEntry, "blockIndex" | "endOffset" | "startOffset">): string =>
  `${entry.blockIndex}:${entry.startOffset}:${entry.endOffset}`

/**
 * 空白だけの補足は無いものとして扱う
 */
const normalizeNote = (noteJa: string | null): string | null => (noteJa === null || noteJa.trim() === "" ? null : noteJa)

/**
 * 和訳をブロックに入れる（code・範囲外・空白だけの和訳は無視）。前回の生成の和訳が残っていても入れ直す
 */
const applyTranslations = (blocks: PassageBlock[], translations: GenerateQuestionsOutput["translations"]): PassageBlock[] => {
  const translationByBlockIndex = new Map<number, string>()
  for (const translation of translations) {
    const block: PassageBlock | undefined = blocks[translation.blockIndex]
    if (!block || block.type === "code" || translation.translationJa.trim() === "") continue
    if (!translationByBlockIndex.has(translation.blockIndex)) {
      translationByBlockIndex.set(translation.blockIndex, translation.translationJa)
    }
  }
  return blocks.map((block, index) => {
    const translatedBlock: PassageBlock = { ...block }
    delete translatedBlock.translationJa
    const translationJa = translationByBlockIndex.get(index)
    if (translationJa !== undefined) translatedBlock.translationJa = translationJa
    return translatedBlock
  })
}

/**
 * 用語集の位置を本文から求める。code・範囲外のブロックを指すものと本文に見つからないものは捨て、同じ位置の重複は 1 つにする
 */
const locateGlossary = (
  blocks: PassageBlock[],
  items: GenerateQuestionsOutput["glossary"],
): { droppedGlossary: DroppedGlossaryItem[]; glossary: DraftGlossaryEntry[] } => {
  const droppedGlossary: DroppedGlossaryItem[] = []
  const glossary: DraftGlossaryEntry[] = []
  const positionKeys = new Set<string>()
  for (const item of items) {
    const range = findProseSurfaceRange(blocks, item.blockIndex, item.surface)
    if (!range) {
      droppedGlossary.push({ blockIndex: item.blockIndex, surface: item.surface })
      continue
    }
    const entry: DraftGlossaryEntry = {
      blockIndex: item.blockIndex,
      endOffset: range.endOffset,
      lemma: item.lemma,
      meaningJa: item.meaningJa,
      noteJa: normalizeNote(item.noteJa),
      partOfSpeech: item.partOfSpeech,
      startOffset: range.startOffset,
      surface: item.surface,
    }
    const key = buildPositionKey(entry)
    if (positionKeys.has(key)) continue
    positionKeys.add(key)
    glossary.push(entry)
  }
  return { droppedGlossary, glossary }
}

/**
 * LLM の出力（`validateGeneratedOutput` に合格したもの）を保存する形に加工し、要確認の理由を集める。
 *
 * 1. 和訳を code 以外のブロックに入れる。和訳の無いブロックは要確認
 * 2. 用語集の位置を `findSurfaceRange` で本文から求める。見つからない語句は捨てて droppedGlossary に入れる
 * 3. 根拠の引用が本文に無ければ要確認（保存はする）
 * 4. 語義設問の対象を用語集の項目に紐づける。用語集に無ければ意味が空の項目を足して紐づけ、本文に無ければ紐づけない（どちらも要確認）
 * 5. 選択肢をシャッフルして正解の位置を無作為にする
 * 6. 制限時間を計算式で求める
 *
 * 要確認の理由のブロックの表記は `numberParagraphs` の「段落 N」と `numberHeadings` の「見出し N」。用語集は位置の順に並べ、設問は glossary の index で指す
 */
export const buildDraftContent = (input: BuildDraftContentInput): BuildDraftContentResult => {
  const { output } = input
  const labelBlock = createBlockLabeler(input.blocks)
  const attentionReasons: string[] = []

  const blocks = applyTranslations(input.blocks, output.translations)
  blocks.forEach((block, index) => {
    if (block.type !== "code" && block.translationJa === undefined) {
      attentionReasons.push(joinLabel(labelBlock(index), "の和訳がありません"))
    }
  })

  const { droppedGlossary, glossary } = locateGlossary(input.blocks, output.glossary)

  const questionsWithTarget = output.questions.map((question, index) => {
    const questionLabel = `Q${index + 1}`
    const evidenceBlock: PassageBlock | undefined = input.blocks[question.evidence.blockIndex]
    if (!evidenceBlock || !hasQuote(evidenceBlock.text, question.evidence.quote)) {
      attentionReasons.push(
        `${questionLabel}：根拠の引用が${joinLabel(labelBlock(question.evidence.blockIndex), "の本文に見つかりません")}`,
      )
    }

    let targetEntry: DraftGlossaryEntry | null = null
    const target = question.vocabularyTarget
    if (question.type === "vocabulary" && target) {
      targetEntry = glossary.find((entry) => entry.blockIndex === target.blockIndex && entry.surface === target.surface) ?? null
      if (!targetEntry) {
        const range = findProseSurfaceRange(input.blocks, target.blockIndex, target.surface)
        if (range) {
          targetEntry = {
            blockIndex: target.blockIndex,
            endOffset: range.endOffset,
            lemma: target.surface,
            meaningJa: "",
            noteJa: null,
            partOfSpeech: null,
            startOffset: range.startOffset,
            surface: target.surface,
          }
          glossary.push(targetEntry)
          attentionReasons.push(
            `${questionLabel}：対象の語句「${target.surface}」を用語集に追加しました。意味を入力してください`,
          )
        } else {
          attentionReasons.push(
            `${questionLabel}：対象の語句「${target.surface}」が${joinLabel(labelBlock(target.blockIndex), "に見つかりません")}`,
          )
        }
      }
    }

    const shuffled = shuffleChoices(question.choices, question.correctChoiceIndex, input.random)
    const draftQuestion: Omit<DraftQuestion, "targetGlossaryIndex"> = {
      choices: shuffled.choices,
      correctChoiceIndex: shuffled.correctChoiceIndex,
      evidenceBlockIndex: question.evidence.blockIndex,
      evidenceQuote: question.evidence.quote,
      explanationJa: question.explanationJa,
      orderIndex: index,
      prompt: question.prompt,
      type: question.type,
      verificationChoiceIndex: null,
    }
    return { question: draftQuestion, targetEntry }
  })

  const sortedGlossary = [...glossary].sort(
    (left, right) => left.blockIndex - right.blockIndex || left.startOffset - right.startOffset || left.endOffset - right.endOffset,
  )
  const questions: DraftQuestion[] = questionsWithTarget.map(({ question, targetEntry }) => ({
    ...question,
    targetGlossaryIndex: targetEntry ? sortedGlossary.indexOf(targetEntry) : null,
  }))

  return {
    content: {
      attentionReasons,
      blocks,
      difficulty: output.difficulty,
      glossary: sortedGlossary,
      questions,
      timeLimitSeconds: calculateTimeLimitSeconds(input.wordCount, output.difficulty, questions.length),
    },
    droppedGlossary,
  }
}
