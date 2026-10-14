/**
 * 切り出した 1 文。highlightStart / highlightEnd は text の中での単語の位置 [start, end)
 */
export type ExtractedSentence = { highlightEnd: number; highlightStart: number; text: string }

/**
 * これより長い文は単語の前後を残して … で切る
 */
const MAX_SENTENCE_LENGTH = 240

/**
 * 長い文を切るとき、単語の前に残す文字数の目安
 */
const CONTEXT_BEFORE_LENGTH = 100

const ELLIPSIS = "…"

/**
 * インラインコード（改行を含まない、対になったバッククォート）。この中の . では文を区切らない
 */
const INLINE_CODE_PATTERN = /`[^`\n]+`/g

/**
 * 文の終わりの記号の直後に空白があれば、そこで文が切れる
 */
const SENTENCE_END_PATTERN = /[.!?](?=\s)/g

/**
 * 文の終わりに見えるが区切らない略語（小文字で比べる）
 */
const ABBREVIATIONS = ["e.g.", "i.e.", "etc.", "vs."]

/**
 * 文の終わりの位置（記号の次の index）の一覧。インラインコードの中と略語は除く
 */
const findSentenceEnds = (text: string): number[] => {
  const codeRanges = [...text.matchAll(INLINE_CODE_PATTERN)].map((match) => ({
    end: match.index + match[0].length,
    start: match.index,
  }))
  return [...text.matchAll(SENTENCE_END_PATTERN)]
    .map((match) => match.index + 1)
    .filter((end) => !codeRanges.some((range) => range.start < end && end <= range.end))
    .filter((end) => !ABBREVIATIONS.some((abbreviation) => text.slice(0, end).toLowerCase().endsWith(abbreviation)))
}

/**
 * 単語の位置 [start, end) を含む 1 文を切り出す。前後の空白は除き、長すぎれば単語の前後を残して … で切る
 */
export const extractSentence = (text: string, range: { end: number; start: number }): ExtractedSentence => {
  const ends = findSentenceEnds(text)
  const startCandidates = ends.filter((end) => end <= range.start)
  const rawStart = startCandidates.length > 0 ? startCandidates[startCandidates.length - 1] : 0
  const rawEnd = ends.find((end) => end >= range.end) ?? text.length
  const raw = text.slice(rawStart, rawEnd)
  const sentenceStart = rawStart + (raw.length - raw.trimStart().length)
  const sentence = text.slice(sentenceStart, rawEnd).trimEnd()
  const highlightStart = range.start - sentenceStart
  const highlightEnd = range.end - sentenceStart
  if (sentence.length <= MAX_SENTENCE_LENGTH) return { highlightEnd, highlightStart, text: sentence }

  const cutStart = Math.max(0, Math.min(highlightStart - CONTEXT_BEFORE_LENGTH, sentence.length - MAX_SENTENCE_LENGTH))
  const cutEnd = Math.min(sentence.length, cutStart + MAX_SENTENCE_LENGTH)
  const prefix = cutStart > 0 ? ELLIPSIS : ""
  const suffix = cutEnd < sentence.length ? ELLIPSIS : ""
  return {
    highlightEnd: highlightEnd - cutStart + prefix.length,
    highlightStart: highlightStart - cutStart + prefix.length,
    text: `${prefix}${sentence.slice(cutStart, cutEnd)}${suffix}`,
  }
}
