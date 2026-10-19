import type { QUESTION_TYPES } from "../const/question"

/**
 * 設問の種類
 */
export type QuestionType = (typeof QUESTION_TYPES)[number]

/**
 * 設問。設問文と選択肢は英語で、それぞれの和訳を持つ。解説は日本語
 */
export type Question = {
  id: number
  /**
   * 4 つ。表示順のまま（A〜D）
   */
  choices: string[]
  /**
   * 選択肢の和訳（choices と同じ順）。vocabulary の設問と、和訳の無い設問（設問の和訳より前に生成した設問）は null
   */
  choicesJa: string[] | null
  correctChoiceIndex: number
  /**
   * 根拠のブロックの位置（passages.blocks の index）
   */
  evidenceBlockIndex: number
  /**
   * 根拠（本文中の該当箇所の引用）
   */
  evidenceQuote: string
  explanationJa: string
  orderIndex: number
  passageId: number
  prompt: string
  /**
   * 設問文の和訳。和訳の無い設問（設問の和訳より前に生成した設問）は null
   */
  promptJa: string | null
  /**
   * vocabulary のときだけ。用語集の項目
   */
  targetGlossaryEntryId: number | null
  type: QuestionType
  /**
   * 解答キーを見ない検証で検証モデルが選んだ選択肢。検証していない設問は null
   */
  verificationChoiceIndex: number | null
  createdAt: Date
  updatedAt: Date
}

/**
 * 用語集の項目（本文中の単語・熟語と、この文脈での意味）。
 * 位置は PassageBlock.text（インラインコードのバッククォートを含む生の文字列）上の UTF-16 の index で、[startOffset, endOffset)
 */
export type GlossaryEntry = {
  id: number
  blockIndex: number
  /**
   * blocks[blockIndex].text 上の位置。end は含まない
   */
  endOffset: number
  /**
   * 見出し語
   */
  lemma: string
  /**
   * 文脈での意味
   */
  meaningJa: string
  noteJa: string | null
  partOfSpeech: string | null
  passageId: number
  startOffset: number
  /**
   * 本文中の表記
   */
  surface: string
  createdAt: Date
  updatedAt: Date
}
