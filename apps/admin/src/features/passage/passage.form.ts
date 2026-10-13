import type { ErrorDetail, GetAdminPassageResponse, UpdateAdminPassageRequest } from "@repo/api-schema"

import type { AdminPassageDifficulty } from "./passage.labels"

/**
 * 問題の確認・修正画面のフォームの状態と、詳細（API のレスポンス）・保存のリクエストとの変換。
 * Client Component から使うので `server-only` を付けない
 */

type DetailBlock = GetAdminPassageResponse["blocks"][number]

type DetailGlossaryEntry = GetAdminPassageResponse["glossary"][number]

type DetailQuestion = GetAdminPassageResponse["questions"][number]

/**
 * 用語集の 1 語句。clientKey は保存済みなら `id-12`、追加分は `new-1`。設問の対象の語句はこれで指す
 */
export type PassageFormGlossaryEntry = Omit<DetailGlossaryEntry, "end_offset" | "id" | "start_offset"> & {
  clientKey: string
  id: number | null
}

/**
 * 設問 1 問。clientKey は開いている設問・エラーの印の目印（保存済みなら `id-12`、追加分は `new-1`）。
 * verification_choice_index は表示用に持ったまま、保存のリクエストには含めない
 */
export type PassageFormQuestion = Omit<DetailQuestion, "id" | "order_index" | "target_glossary_entry_id"> & {
  clientKey: string
  id: number | null
  targetGlossaryKey: string | null
}

export type PassageForm = {
  /**
   * 英文と和訳だけ（数と種類は変えられない。種類と言語は詳細の blocks を見る）
   */
  blocks: { text: string, translationJa: string | null }[]
  difficulty: AdminPassageDifficulty
  glossary: PassageFormGlossaryEntry[]
  questions: PassageFormQuestion[]
  /**
   * 制限時間の入力欄の値（`m:ss`）。保存時に秒にする
   */
  timeLimitText: string
  title: string
}

/**
 * 保存・公開の 400 の details を、画面の項目に付けるエラーの印にしたもの。
 * 設問と語句は配列の位置ではなく clientKey で持つ（エラーの後に設問を消しても、別の設問に印が移らないように）
 */
export type PassageErrorMarks = {
  evidenceQuestionKeys: string[]
  glossaryMessages: Record<string, string[]>
  hasTimeLimitError: boolean
  hasTitleError: boolean
  textBlockIndexes: number[]
  translationBlockIndexes: number[]
}

/**
 * 難易度が未設定の下書き（通常は無い）は Normal を初期値にする
 */
const DEFAULT_DIFFICULTY: AdminPassageDifficulty = 2

const NEW_KEY_PATTERN = /^new-(\d+)$/

const TIME_LIMIT_PATTERN = /^(\d{1,3}):([0-5]\d)$/

/**
 * 根拠の引用の比較で無視するバッククォート（API の hasQuote と同じ）
 */
const BACKQUOTE_PATTERN = /`/g

/**
 * 空白だけの文字列は null にする（API も空白だけの和訳・補足・品詞を未入力として保存する）
 */
const convertBlankToNull = (value: string | null): string | null =>
  (value === null || value.trim().length === 0 ? null : value)

/**
 * 秒を `5:30` の形にする
 */
export const formatSeconds = (totalSeconds: number): string =>
  `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`

/**
 * `5:30` の形の制限時間を秒にする。形が違う・0 秒なら null
 */
export const convertTimeLimitTextToSeconds = (text: string): number | null => {
  const matched = TIME_LIMIT_PATTERN.exec(text.trim())
  if (!matched) return null
  const seconds = Number(matched[1]) * 60 + Number(matched[2])
  return seconds > 0 ? seconds : null
}

/**
 * ブロックごとの段落番号（1 始まり）。見出しとコードは数えず null。設問文の "paragraph 1"、要確認の理由の「段落 1」と対応する
 */
export const numberParagraphs = (blocks: Pick<DetailBlock, "type">[]): (number | null)[] => {
  let count = 0
  return blocks.map((block) => (block.type === "code" || block.type === "heading" ? null : ++count))
}

/**
 * ブロックの表記（見出し / コード（lang） / 段落 N）
 */
export const formatBlockLabel = (blocks: Pick<DetailBlock, "lang" | "type">[], blockIndex: number): string => {
  const block = blocks[blockIndex]
  if (!block) return `ブロック ${blockIndex + 1}`
  if (block.type === "heading") return "見出し"
  if (block.type === "code") return block.lang ? `コード（${block.lang}）` : "コード"
  return `段落 ${numberParagraphs(blocks)[blockIndex]}`
}

/**
 * 根拠の引用がブロックの本文に含まれるか。バッククォートを除いた文字列同士で比べる（API の公開の検査・プレビューのハイライトと同じ）
 */
export const hasQuoteInText = (text: string, quote: string): boolean => {
  const normalizedQuote = quote.replace(BACKQUOTE_PATTERN, "")
  if (normalizedQuote.length === 0) return false
  return text.replace(BACKQUOTE_PATTERN, "").includes(normalizedQuote)
}

/**
 * 英単語数から目安の設問数を出す（〜300 語は 3 問、301〜450 語は 4 問、451 語〜は 5 問）
 */
export const calculateRecommendedQuestionCount = (wordCount: number): number => {
  if (wordCount <= 300) return 3
  if (wordCount <= 450) return 4
  return 5
}

/**
 * 「計算式で再計算」の結果。rawSeconds は切り上げ前の秒数（表示用）
 */
export type TimeLimitCalculation = {
  rawSeconds: number
  seconds: number
  wpm: number
}

/**
 * 制限時間（秒） = 英単語数 ÷ WPM × 60 ＋ 設問数 × 1 問の秒数 を rounding_seconds 単位に切り上げる。
 * 式の定数は API から受け取る（admin は @repo/domain を import できない）。切り上げは API と同じく整数で計算する
 */
export const calculateTimeLimit = (
  formula: GetAdminPassageResponse["time_limit_formula"],
  input: { difficulty: AdminPassageDifficulty, questionCount: number, wordCount: number },
): TimeLimitCalculation | null => {
  const wpm = formula.wpm_by_difficulty.find((item) => item.difficulty === input.difficulty)?.wpm
  if (wpm === undefined || wpm <= 0) return null
  const numerator = input.wordCount * 60 + input.questionCount * formula.seconds_per_question * wpm
  return {
    rawSeconds: numerator / wpm,
    seconds: Math.ceil(numerator / (wpm * formula.rounding_seconds)) * formula.rounding_seconds,
    wpm,
  }
}

/**
 * 追加する項目の clientKey（`new-1`、`new-2` …）。既存の new- の番号の最大 + 1 にする
 */
export const createNewClientKey = (existingKeys: string[]): string => {
  const maxNumber = existingKeys.reduce((max, key) => {
    const matched = NEW_KEY_PATTERN.exec(key)
    return matched ? Math.max(max, Number(matched[1])) : max
  }, 0)
  return `new-${maxNumber + 1}`
}

/**
 * 詳細をフォームの状態にする
 */
export const convertDetailToForm = (detail: GetAdminPassageResponse): PassageForm => {
  const glossaryKeyById = new Map(detail.glossary.map((entry) => [entry.id, `id-${entry.id}`]))
  return {
    blocks: detail.blocks.map((block) => ({ text: block.text, translationJa: block.translation_ja })),
    difficulty: detail.difficulty ?? DEFAULT_DIFFICULTY,
    glossary: detail.glossary.map(({ end_offset: _endOffset, start_offset: _startOffset, ...entry }) => ({
      ...entry,
      clientKey: `id-${entry.id}`,
    })),
    questions: detail.questions.map(({ order_index: _orderIndex, target_glossary_entry_id: targetId, ...question }) => ({
      ...question,
      clientKey: `id-${question.id}`,
      targetGlossaryKey: targetId === null ? null : glossaryKeyById.get(targetId) ?? null,
    })),
    timeLimitText: detail.time_limit_seconds === null ? "" : formatSeconds(detail.time_limit_seconds),
    title: detail.title,
  }
}

/**
 * フォームの状態を保存のリクエストにする。設問の targetGlossaryKey は glossary 配列の位置（target_glossary_index）に直す。
 * 制限時間の形が違うときは 0 秒にして、Server Action のスキーマ検証で不合格にする
 */
export const convertFormToRequest = (form: PassageForm): UpdateAdminPassageRequest => {
  const glossaryIndexByKey = new Map(form.glossary.map((entry, index) => [entry.clientKey, index]))
  return {
    blocks: form.blocks.map((block) => ({ text: block.text, translation_ja: convertBlankToNull(block.translationJa) })),
    difficulty: form.difficulty,
    glossary: form.glossary.map((entry) => ({
      id: entry.id,
      block_index: entry.block_index,
      lemma: entry.lemma,
      meaning_ja: entry.meaning_ja,
      note_ja: convertBlankToNull(entry.note_ja),
      part_of_speech: convertBlankToNull(entry.part_of_speech),
      surface: entry.surface,
    })),
    questions: form.questions.map((question) => ({
      id: question.id,
      choices: question.choices,
      correct_choice_index: question.correct_choice_index,
      evidence: question.evidence,
      explanation_ja: question.explanation_ja,
      prompt: question.prompt,
      target_glossary_index:
        question.type === "vocabulary" && question.targetGlossaryKey !== null
          ? glossaryIndexByKey.get(question.targetGlossaryKey) ?? null
          : null,
      type: question.type,
    })),
    time_limit_seconds: convertTimeLimitTextToSeconds(form.timeLimitText) ?? 0,
    title: form.title,
  }
}

/**
 * 保存の前に画面で見つけられる入力の誤り（タイトル・制限時間・空の英文）。形は API の details と同じ
 */
export const listFormProblems = (form: PassageForm, blocks: Pick<DetailBlock, "lang" | "type">[]): ErrorDetail[] => {
  const problems: ErrorDetail[] = []
  if (form.title.trim().length === 0) {
    problems.push({ code: "title_blank", message: "タイトルを入力してください", path: ["title"] })
  }
  if (convertTimeLimitTextToSeconds(form.timeLimitText) === null) {
    problems.push({ code: "time_limit_invalid", message: "制限時間は m:ss の形で入力してください（例 5:30）", path: ["time_limit_seconds"] })
  }
  form.blocks.forEach((block, index) => {
    if (block.text.trim().length > 0) return
    problems.push({ code: "text_blank", message: `${formatBlockLabel(blocks, index)}の英文が空です`, path: ["blocks", index, "text"] })
  })
  return problems
}

/**
 * details をエラーの印にする。path の位置は snapshot（リクエストを作ったときのフォーム）の配列の位置
 */
export const convertDetailsToMarks = (details: ErrorDetail[], snapshot: PassageForm): PassageErrorMarks => {
  const marks: PassageErrorMarks = {
    evidenceQuestionKeys: [],
    glossaryMessages: {},
    hasTimeLimitError: false,
    hasTitleError: false,
    textBlockIndexes: [],
    translationBlockIndexes: [],
  }
  for (const detail of details) {
    const [field, index, property] = detail.path
    if (field === "title") marks.hasTitleError = true
    if (field === "time_limit_seconds") marks.hasTimeLimitError = true
    if (typeof index !== "number") continue

    if (field === "blocks" && property === "translation_ja") marks.translationBlockIndexes.push(index)
    if (field === "blocks" && property === "text") marks.textBlockIndexes.push(index)

    const questionKey = field === "questions" ? snapshot.questions[index]?.clientKey : undefined
    if (questionKey && property === "evidence") marks.evidenceQuestionKeys.push(questionKey)

    const glossaryKey = field === "glossary" ? snapshot.glossary[index]?.clientKey : undefined
    if (glossaryKey) marks.glossaryMessages[glossaryKey] = [...(marks.glossaryMessages[glossaryKey] ?? []), detail.message]
  }
  return marks
}
