import { findSurfaceRange, type WordLookupSource } from "@repo/domain"

import type { VocabularyEncounter } from "../repository"

import { type ExtractedSentence, extractSentence } from "./extract-sentence"

/**
 * カードの中身（API の snake_case への変換は Controller で行う）
 */
export type VocabularyCardView = {
  lemma: string
  meaningJa: string
  meaningSource: WordLookupSource
  noteJa: string | null
  partOfSpeech: string | null
  passage: { id: number; title: string }
  sentence: ExtractedSentence | null
  /**
   * 1 文を切り出したブロックの index（1 文の読み上げの区間を求めるのに使う。レスポンスには出さない）。1 文が無ければ null
   */
  sentenceBlockIndex: number | null
  /**
   * 答える前の段階。新しい単語は null
   */
  stage: number | null
  surface: string
}

/**
 * 用語集の行が無いとき、本文のブロック（code 以外）を前から探して、語句が最初に見つかった位置の 1 文とそのブロックの index
 */
const findSentenceBySurface = (encounter: VocabularyEncounter): { blockIndex: number; sentence: ExtractedSentence } | null => {
  for (const [blockIndex, block] of (encounter.passage.blocks ?? []).entries()) {
    if (block.type === "code") continue
    const range = findSurfaceRange(block.text, encounter.surface)
    if (range) return { blockIndex, sentence: extractSentence(block.text, { end: range.endOffset, start: range.startOffset }) }
  }
  return null
}

/**
 * 出会った場所からカードの中身を作る（vocabulary-cards README「カードの中身の組み立て」）。
 * 用語集の行があれば文脈での意味と位置を使い、無ければ英和辞書の意味と本文の検索で作る。
 * 意味が無ければ null（Repository が意味のある見出し語だけを返すので、通常は来ない）
 */
export const buildVocabularyCard = (encounter: VocabularyEncounter, stage: number | null): VocabularyCardView | null => {
  const base = { lemma: encounter.lemma, passage: { id: encounter.passage.id, title: encounter.passage.title }, stage }
  const { glossary } = encounter
  if (glossary) {
    const block = encounter.passage.blocks?.[glossary.blockIndex]
    return {
      ...base,
      meaningJa: glossary.meaningJa,
      meaningSource: "glossary",
      noteJa: glossary.noteJa,
      partOfSpeech: glossary.partOfSpeech,
      sentence: block ? extractSentence(block.text, { end: glossary.endOffset, start: glossary.startOffset }) : null,
      sentenceBlockIndex: block ? glossary.blockIndex : null,
      surface: glossary.surface,
    }
  }
  if (encounter.dictionaryMeaningJa === null) return null
  const found = findSentenceBySurface(encounter)
  return {
    ...base,
    meaningJa: encounter.dictionaryMeaningJa,
    meaningSource: "dictionary",
    noteJa: null,
    partOfSpeech: null,
    sentence: found?.sentence ?? null,
    sentenceBlockIndex: found?.blockIndex ?? null,
    surface: encounter.surface,
  }
}
