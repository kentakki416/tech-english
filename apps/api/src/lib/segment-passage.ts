import { findSurfaceRanges, type GlossaryEntry, type PassageBlock, type PassageSegmentKind } from "@repo/domain"

import { findLookupTargetRanges } from "./part-of-speech"

/**
 * 本文のセグメント（reading-practice README「本文のトークン化」）。API の snake_case への変換は Controller で行う
 */
export type PassageSegment = {
  /**
   * kind が word のときだけ。押して意味を引けるか（名詞・動詞と用語集の語句は true）
   */
  canLookUp?: boolean
  /**
   * 用語集の語句のときだけ（熟語も 1 つのセグメント）
   */
  glossaryEntryId?: number
  kind: PassageSegmentKind
  /**
   * code はバッククォートを除いた中身
   */
  text: string
}

/**
 * 元のブロック本文での位置（[start, end)。code はバッククォートを含む）。根拠のハイライトの計算に使い、レスポンスには出さない
 */
export type SegmentWithRange = PassageSegment & { end: number; start: number }

/**
 * セグメント分割に使う用語集の列。位置は PassageBlock.text（バッククォートを含む）上の UTF-16 の index で [startOffset, endOffset)
 */
export type GlossarySpan = Pick<GlossaryEntry, "blockIndex" | "endOffset" | "id" | "startOffset" | "surface">

type TextRange = { end: number; start: number }

/**
 * インラインコード（改行を含まない、対になったバッククォート）
 */
const INLINE_CODE_PATTERN = /`[^`\n]+`/g

/**
 * 単語（`React's`・`re-render` は 1 語）/ 空白 / それ以外（記号・数字・対になっていないバッククォート）。
 * どの文字もいずれかに当てはまるので、一致を並べると元の文字列に戻る
 */
const TOKEN_PATTERN = /([A-Za-z]+(?:['’-][A-Za-z]+)*)|(\s+)|([^A-Za-z\s]+)/g

const BACKQUOTE_PATTERN = /`/g

const isOverlapping = (left: TextRange, right: TextRange): boolean => left.start < right.end && right.start < left.end

const findInlineCodeRanges = (text: string): TextRange[] =>
  [...text.matchAll(INLINE_CODE_PATTERN)].map((match) => ({ end: match.index + match[0].length, start: match.index }))

/**
 * インラインコードを同じ長さの X と空白に置き換える。品詞の判定で、位置をずらさず文の形を保つため
 */
const maskInlineCode = (text: string): string => text.replace(INLINE_CODE_PATTERN, (code) => `X${" ".repeat(code.length - 1)}`)

/**
 * 分割に使う用語集を選ぶ。範囲外・インラインコードと重なるものは捨て、用語集どうしが重なったら開始が早い方（同じなら長い方）を残す
 */
const selectGlossarySpans = (text: string, glossary: GlossarySpan[], codeRanges: TextRange[]): GlossarySpan[] => {
  const candidates = glossary
    .filter((entry) => entry.startOffset >= 0 && entry.startOffset < entry.endOffset && entry.endOffset <= text.length)
    .filter((entry) => !codeRanges.some((range) => isOverlapping(range, { end: entry.endOffset, start: entry.startOffset })))
    .sort((left, right) => left.startOffset - right.startOffset || right.endOffset - left.endOffset || left.id - right.id)
  const selected: GlossarySpan[] = []
  let selectedEnd = 0
  for (const entry of candidates) {
    /**
     * 開始の順に並んでいるので、直前に残したものの終わりより前に始まるものは重なっている
     */
    if (entry.startOffset < selectedEnd) continue
    selected.push(entry)
    selectedEnd = entry.endOffset
  }
  return selected
}

/**
 * インラインコードと用語集以外の部分 [start, end) を単語・空白・記号に分ける。
 * 単語は、押して意味を引ける品詞のトークン（lookupTargetRanges）と重なれば押せる（`third-party` は `party` が名詞なので押せる）
 */
const tokenizePlainText = (text: string, start: number, end: number, lookupTargetRanges: TextRange[]): SegmentWithRange[] =>
  [...text.slice(start, end).matchAll(TOKEN_PATTERN)].map((match) => {
    const segmentStart = start + match.index
    const segmentEnd = segmentStart + match[0].length
    if (match[1] !== undefined) {
      const canLookUp = lookupTargetRanges.some((range) => isOverlapping(range, { end: segmentEnd, start: segmentStart }))
      return { canLookUp, end: segmentEnd, kind: "word", start: segmentStart, text: match[0] }
    }
    const kind: PassageSegmentKind = match[2] !== undefined ? "space" : "punct"
    return { end: segmentEnd, kind, start: segmentStart, text: match[0] }
  })

/**
 * ブロックの本文をセグメントに分ける。code だけバッククォートで囲み直して順に連結すると元の text に戻る
 */
const segmentBlockText = (text: string, glossary: GlossarySpan[]): SegmentWithRange[] => {
  const codeRanges = findInlineCodeRanges(text)
  const lookupTargetRanges = findLookupTargetRanges(maskInlineCode(text))
  const specialSegments: SegmentWithRange[] = [
    ...codeRanges.map((range): SegmentWithRange => ({
      end: range.end,
      kind: "code",
      start: range.start,
      text: text.slice(range.start + 1, range.end - 1),
    })),
    ...selectGlossarySpans(text, glossary, codeRanges).map((entry): SegmentWithRange => ({
      canLookUp: true,
      end: entry.endOffset,
      glossaryEntryId: entry.id,
      kind: "word",
      start: entry.startOffset,
      text: text.slice(entry.startOffset, entry.endOffset),
    })),
  ].sort((left, right) => left.start - right.start)

  const segments: SegmentWithRange[] = []
  let cursor = 0
  for (const segment of specialSegments) {
    segments.push(...tokenizePlainText(text, cursor, segment.start, lookupTargetRanges), segment)
    cursor = segment.end
  }
  segments.push(...tokenizePlainText(text, cursor, text.length, lookupTargetRanges))
  return segments
}

/**
 * ブロックの用語集の位置。保存してある位置（そのブロックの項目）と、すべての項目の同じ表記のほかの出現（語の境界で区切られたもの。
 * ほかのブロックの項目も含む）を返す。保存してある位置と同じ範囲の出現は、表記が同じ別の項目のものでも外す（保存してある項目を使う）。
 * ほかの重なりは selectGlossarySpans が 1 つにする
 */
const collectGlossaryOccurrences = (text: string, blockIndex: number, glossary: GlossarySpan[]): GlossarySpan[] => {
  const storedSpans = glossary.filter((entry) => entry.blockIndex === blockIndex)
  const otherOccurrences = glossary.flatMap((entry) =>
    findSurfaceRanges(text, entry.surface)
      .filter((range) => !storedSpans.some((stored) => stored.startOffset === range.startOffset && stored.endOffset === range.endOffset))
      .map((range) => ({ ...entry, blockIndex, endOffset: range.endOffset, startOffset: range.startOffset })),
  )
  return [...storedSpans, ...otherOccurrences]
}

/**
 * 本文の全ブロックをセグメントに分ける。code のブロックは []
 */
export const segmentPassage = (blocks: PassageBlock[], glossary: GlossarySpan[]): SegmentWithRange[][] =>
  blocks.map((block, blockIndex) =>
    block.type === "code" ? [] : segmentBlockText(block.text, collectGlossaryOccurrences(block.text, blockIndex, glossary)),
  )

/**
 * 引用の本文中の位置。そのまま見つからなければ、バッククォートを除いた文字列同士で探して元の位置に戻す
 * （公開の条件の hasQuote と同じく、引用がインラインコードのバッククォートを省いていても見つける）
 */
const locateQuote = (text: string, quote: string): TextRange | null => {
  if (quote.length === 0) return null
  const start = text.indexOf(quote)
  if (start !== -1) return { end: start + quote.length, start }

  const normalizedQuote = quote.replace(BACKQUOTE_PATTERN, "")
  if (normalizedQuote.length === 0) return null
  /**
   * 位置は UTF-16 の index なので、コードポイントではなくコードユニットごとに見る
   */
  const originalIndexes: number[] = []
  let normalizedText = ""
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index)
    if (char === "`") continue
    originalIndexes.push(index)
    normalizedText += char
  }
  const normalizedStart = normalizedText.indexOf(normalizedQuote)
  if (normalizedStart === -1) return null
  const firstIndex = originalIndexes[normalizedStart]
  const lastIndex = originalIndexes[normalizedStart + normalizedQuote.length - 1]
  if (firstIndex === undefined || lastIndex === undefined) return null
  return { end: lastIndex + 1, start: firstIndex }
}

/**
 * 根拠の引用と重なるセグメントの添字の範囲（end は含まない）。引用が本文に見つからなければ null
 */
export const findEvidenceSegmentRange = (
  text: string,
  segments: SegmentWithRange[],
  quote: string,
): { end: number; start: number } | null => {
  const range = locateQuote(text, quote)
  if (!range) return null
  const indexes = segments.flatMap((segment, index) => (isOverlapping(segment, range) ? [index] : []))
  const first = indexes[0]
  const last = indexes[indexes.length - 1]
  if (first === undefined || last === undefined) return null
  return { end: last + 1, start: first }
}

export const forTesting = { segmentBlockText }
