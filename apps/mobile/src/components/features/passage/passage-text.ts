/**
 * 和訳の文の部品。isCode はインラインコード（バッククォートを除いた中身）
 */
export type TranslationPart = {
  isCode: boolean
  text: string
}

/**
 * 改行を含まない、対になったバッククォート（api のセグメント分割と同じ条件）
 */
const INLINE_CODE_PATTERN = /(`[^`\n]+`)/

/**
 * 和訳（translation_ja）をインラインコードとそれ以外に分ける（web の `passage-text.ts` と同じ）。
 * 和訳は単語を押せないので api はセグメントに分けずに返す。コードの見た目にするためだけの表示の処理
 */
export const splitInlineCode = (text: string): TranslationPart[] =>
  /**
   * 捕捉グループつきの split は、奇数番目に区切り（= インラインコード）が入る
   */
  text
    .split(INLINE_CODE_PATTERN)
    .map((part, index) => (index % 2 === 1 ? { isCode: true, text: part.slice(1, -1) } : { isCode: false, text: part }))
    .filter(part => part.text.length > 0)

/**
 * 英和辞書（EJDict-hand）の意味は語義を ` / ` で区切って 1 行に並べている。カードでは語義ごとに行を分けて読みやすくする（表示だけの処理）
 */
export const splitDictionarySenses = (meaningJa: string): string[] =>
  meaningJa
    .split(/\s+\/\s+/)
    .map(sense => sense.trim())
    .filter(sense => sense.length > 0)
