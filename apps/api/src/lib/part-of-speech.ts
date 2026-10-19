import model from "wink-eng-lite-web-model"
import winkNLP from "wink-nlp"

/**
 * 単語を押して意味を引ける品詞（Universal POS）。技術文書では大文字で始まる普通名詞（Effects など）を
 * 固有名詞と判定しがちなので、固有名詞（PROPN）も含める
 */
const LOOKUP_TARGET_TAGS = new Set(["NOUN", "PROPN", "VERB"])

/**
 * モデル（約 4MB）はモジュールの読み込み時に 1 回だけ読む
 */
const nlp = winkNLP(model)

/**
 * 本文から、単語を押して意味を引ける品詞（名詞・固有名詞・動詞）の wink-nlp のトークンの位置 [start, end) を返す
 */
export const findLookupTargetRanges = (text: string): { end: number; start: number }[] => {
  const tokens = nlp.readDoc(text).tokens()
  const values = tokens.out(nlp.its.value)
  const tags = tokens.out(nlp.its.pos)
  const ranges: { end: number; start: number }[] = []
  let cursor = 0
  values.forEach((value, index) => {
    const start = text.indexOf(value, cursor)
    if (start === -1) return
    cursor = start + value.length
    if (LOOKUP_TARGET_TAGS.has(tags[index] ?? "")) ranges.push({ end: cursor, start })
  })
  return ranges
}
