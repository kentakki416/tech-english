/**
 * インラインコード。api の本文のセグメント分割（apps/api/src/lib/segment-passage.ts）と同じ判定にする
 * （ハイライトは単語の時刻の位置とセグメントの位置の重なりで決まるため）
 */
const INLINE_CODE_PATTERN = /`[^`\n]+`/g

/**
 * 読み上げ用テキストと、その各位置の元の本文での位置
 */
export type SpeechText = {
  /**
   * speechText の各位置（UTF-16）の元の本文での位置。末尾に元の本文の長さを番兵として足す（長さは speechText.length + 1）
   */
  sourceOffsets: number[]
  speechText: string
}

/**
 * 元の本文（PassageBlock.text）から読み上げ用テキストを作る。対になったインラインコードのバッククォートだけを除き
 * （中身は書いてあるとおりに読む）、対になっていないバッククォートは残す
 */
export const buildSpeechText = (text: string): SpeechText => {
  const sourceOffsets: number[] = []
  const pieces: string[] = []
  const appendSource = (start: number, end: number): void => {
    pieces.push(text.slice(start, end))
    for (let index = start; index < end; index++) sourceOffsets.push(index)
  }
  let cursor = 0
  for (const match of text.matchAll(INLINE_CODE_PATTERN)) {
    appendSource(cursor, match.index)
    appendSource(match.index + 1, match.index + match[0].length - 1)
    cursor = match.index + match[0].length
  }
  appendSource(cursor, text.length)
  sourceOffsets.push(text.length)
  return { sourceOffsets, speechText: pieces.join("") }
}

/**
 * 読み上げ用テキストの [start, end) を元の本文の [startOffset, endOffset) にする。
 * endOffset は「最後の文字の次」（sourceOffsets[end - 1] + 1）で求め、閉じのバッククォートを範囲に含めない。範囲が空なら endOffset = startOffset
 */
export const mapSpeechRangeToSource = (
  speech: SpeechText,
  start: number,
  end: number,
): { endOffset: number; startOffset: number } => {
  const startOffset = speech.sourceOffsets[start] ?? speech.sourceOffsets[speech.sourceOffsets.length - 1] ?? 0
  if (end <= start) return { endOffset: startOffset, startOffset }
  const lastOffset = speech.sourceOffsets[end - 1]
  return { endOffset: lastOffset === undefined ? startOffset : lastOffset + 1, startOffset }
}
