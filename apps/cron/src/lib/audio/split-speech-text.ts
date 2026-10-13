/**
 * 1 回の音声合成に渡す読み上げ用テキストの一部
 */
export type SpeechPart = {
  /**
   * 読み上げ用テキストの中での開始位置（UTF-16）
   */
  start: number
  /**
   * 前後の空白を除いたテキスト。speechText.slice(start, start + text.length) と一致する
   */
  text: string
}

/**
 * 文の区切り（文末の記号と、続く閉じ括弧・引用符と空白）。区切りの候補は一致の直後
 */
const SENTENCE_BOUNDARY_PATTERN = /[.!?]["')\]]*\s+/g

const WHITESPACE_PATTERN = /\s/

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff

const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff

/**
 * position から maxLength 以内で切る位置（パートの終わり。この位置の文字は含まない）と、次のパートを探し始める位置。
 * ① 最も遠い文の区切り ② 最後の空白 ③ maxLength（サロゲートペアの間では切らない）の順に探す
 */
const findCut = (speechText: string, position: number, maxLength: number): { end: number; next: number } => {
  const limit = position + maxLength
  const pattern = new RegExp(SENTENCE_BOUNDARY_PATTERN.source, "g")
  pattern.lastIndex = position
  let sentenceCut: { end: number; next: number } | null = null
  for (let match = pattern.exec(speechText); match && match.index < limit; match = pattern.exec(speechText)) {
    /**
     * 区切りの記号（と閉じ括弧）までがパートに入る。空白は次のパートの前の空白として飛ばす
     */
    const end = match.index + match[0].trimEnd().length
    if (end <= limit) sentenceCut = { end, next: match.index + match[0].length }
  }
  if (sentenceCut) return sentenceCut

  for (let index = limit; index > position; index--) {
    if (WHITESPACE_PATTERN.test(speechText[index] ?? "")) return { end: index, next: index }
  }

  const isInsidePair = isHighSurrogate(speechText.charCodeAt(limit - 1)) && isLowSurrogate(speechText.charCodeAt(limit))
  const end = isInsidePair ? limit - 1 : limit
  return { end, next: end }
}

/**
 * 読み上げ用テキストを maxLength 文字（UTF-16）以下のパートに分ける。maxLength 以下なら 1 パート。
 * 各パートは前後の空白を除き、除いた分 start を進める。Polly の上限（課金対象 3,000 文字）は文字数なので、
 * UTF-16 の長さ（コードポイント数以上）で比べれば必ず収まる
 */
export const splitSpeechText = (speechText: string, maxLength: number): SpeechPart[] => {
  const parts: SpeechPart[] = []
  let position = 0
  while (position < speechText.length) {
    while (position < speechText.length && WHITESPACE_PATTERN.test(speechText[position] ?? "")) position++
    if (position >= speechText.length) break

    const cut = speechText.length - position <= maxLength
      ? { end: speechText.length, next: speechText.length }
      : findCut(speechText, position, maxLength)
    const text = speechText.slice(position, cut.end).trimEnd()
    if (text.length > 0) parts.push({ start: position, text })
    position = cut.next
  }
  return parts
}
