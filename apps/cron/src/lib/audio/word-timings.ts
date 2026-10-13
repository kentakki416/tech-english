import type { AudioWordTiming } from "@repo/domain"

import { mapSpeechRangeToSource, type SpeechText } from "./speech-text"
import type { SpeechPart } from "./split-speech-text"
import { createUtf8ToUtf16IndexMap } from "./utf8-offset"

/**
 * Polly の Speech Marks（word）の 1 つ。start / end は送ったテキストの UTF-8 のバイト位置で、end は含まない
 */
export type SpeechMark = {
  end: number
  start: number
  /**
   * 音声の先頭からのミリ秒
   */
  time: number
  value: string
}

/**
 * 1 パートの Speech Marks をマニフェストの単語の時刻にする。
 * バイト位置 → パート内の UTF-16 の位置 → 読み上げ用テキストの位置（+ part.start）→ 元の本文の位置、の順に変換する。
 * 範囲が空になった単語は捨て、endMs は次の単語の time（最後の単語はパートの durationMs）にする
 */
export const convertSpeechMarksToWordTimings = (input: {
  durationMs: number
  marks: SpeechMark[]
  part: SpeechPart
  speech: SpeechText
}): AudioWordTiming[] => {
  const indexMap = createUtf8ToUtf16IndexMap(input.part.text)
  const lastByte = indexMap.length - 1
  const toSpeechIndex = (byteOffset: number): number =>
    (indexMap[Math.min(Math.max(byteOffset, 0), lastByte)] ?? 0) + input.part.start

  const words = input.marks
    .map((mark) => ({
      ...mapSpeechRangeToSource(input.speech, toSpeechIndex(mark.start), toSpeechIndex(mark.end)),
      time: mark.time,
    }))
    .filter((word) => word.endOffset > word.startOffset)
  return words.map((word, index): AudioWordTiming => {
    const endMs = words[index + 1]?.time ?? input.durationMs
    return [word.time, Math.max(word.time, endMs), word.startOffset, word.endOffset]
  })
}
