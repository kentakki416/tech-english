import type { AttemptBlock, GetAttemptAudioResponse, PassageSegmentResponse } from "@repo/api-schema"

/**
 * 読み上げの時刻表（docs/spec/read-aloud/README.md「再生の実装」）。マニフェストとブロックのセグメントから、再生とハイライトに使う形を作る。
 * ブラウザでだけ使うが、DOM に触れない純関数なので `server-only` も `"use client"` も付けない
 */

type ReadyAudio = Extract<GetAttemptAudioResponse, { status: "ready" }>

type TextRange = {
  end: number
  start: number
}

/**
 * 1 語の時刻と、ハイライトするセグメントの添字の範囲 [segmentStart, segmentEnd)
 */
export type TimelineWord = {
  endMs: number
  segmentEnd: number
  segmentStart: number
  startMs: number
}

export type TimelinePart = {
  durationMs: number
  url: string
  /**
   * 時刻の昇順（Polly の順）
   */
  words: TimelineWord[]
}

export type TimelineBlock = {
  blockIndex: number
  /**
   * パートの長さの合計
   */
  durationMs: number
  parts: TimelinePart[]
}

export type ReadAloudTimeline = {
  /**
   * 読み上げるブロック（コードブロックと、パートの無いブロックは含めない）を本文の順に
   */
  blocks: TimelineBlock[]
  totalDurationMs: number
}

/**
 * 再生位置。positionMs はパートの先頭からのミリ秒
 */
export type ReadAloudPosition = {
  blockIndex: number
  mode: "all" | "block"
  partIndex: number
  positionMs: number
}

const sumDurations = (items: { durationMs: number }[]): number => items.reduce((sum, item) => sum + item.durationMs, 0)

const isOverlapping = (left: TextRange, right: TextRange): boolean => left.start < right.end && right.start < left.end

/**
 * セグメントの元の本文（blocks[].text）での位置 [start, end)。
 * api はインラインコードのセグメントからバッククォートを除いて返すので、code は 2 文字を足す（順に連結すると text に戻る）
 */
const buildSegmentRanges = (segments: PassageSegmentResponse[]): TextRange[] => {
  let cursor = 0
  return segments.map((segment) => {
    const length = segment.text.length + (segment.kind === "code" ? 2 : 0)
    const range = { end: cursor + length, start: cursor }
    cursor += length
    return range
  })
}

/**
 * 単語の時刻の位置 [startOffset, endOffset)（blocks[].text 上の UTF-16 の位置）と重なる、単語・インラインコードのセグメントの範囲。
 * 空白・記号だけと重なるもの（無いはず）は null にして、ハイライトしない
 */
const convertOffsetsToSegmentRange = (
  segments: PassageSegmentResponse[],
  segmentRanges: TextRange[],
  offsets: TextRange,
): { segmentEnd: number, segmentStart: number } | null => {
  let first = -1
  let last = -1
  segments.forEach((segment, index) => {
    if (segment.kind !== "word" && segment.kind !== "code") return
    const range = segmentRanges[index]
    if (range === undefined || !isOverlapping(range, offsets)) return
    if (first === -1) first = index
    last = index
  })
  return first === -1 ? null : { segmentEnd: last + 1, segmentStart: first }
}

/**
 * マニフェストの block_index が範囲外・コードブロックのものは捨てる。単語は位置がセグメントに重ならないものを捨てる
 * （時刻表から抜けるだけで、その単語の間は前の単語のハイライトが残る）。パートが 0 のブロックは含めず、blockIndex の昇順に並べる
 */
export const buildReadAloudTimeline = (blocks: AttemptBlock[], audio: ReadyAudio): ReadAloudTimeline => {
  const timelineBlocks = audio.blocks
    .flatMap((manifestBlock): TimelineBlock[] => {
      const block = blocks[manifestBlock.block_index]
      if (block === undefined || block.type === "code" || manifestBlock.parts.length === 0) return []
      const segmentRanges = buildSegmentRanges(block.segments)
      const parts = manifestBlock.parts.map((part): TimelinePart => ({
        durationMs: part.duration_ms,
        url: part.url,
        words: part.words.flatMap(([startMs, endMs, startOffset, endOffset]): TimelineWord[] => {
          const range = convertOffsetsToSegmentRange(block.segments, segmentRanges, { end: endOffset, start: startOffset })
          return range === null ? [] : [{ endMs, segmentEnd: range.segmentEnd, segmentStart: range.segmentStart, startMs }]
        }),
      }))
      return [{ blockIndex: manifestBlock.block_index, durationMs: sumDurations(parts), parts }]
    })
    .sort((left, right) => left.blockIndex - right.blockIndex)
  return { blocks: timelineBlocks, totalDurationMs: sumDurations(timelineBlocks) }
}

/**
 * 再生位置（パートの先頭からのミリ秒）で読んでいる単語の添字。startMs が位置以下の最後の単語を二分探索で引く。最初の単語より前は -1
 */
export const findWordIndexAt = (words: TimelineWord[], positionMs: number): number => {
  let low = 0
  let high = words.length - 1
  let found = -1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const word = words[middle]
    if (word !== undefined && word.startMs <= positionMs) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

/**
 * ブロックの中の再生位置（前のパートの長さの合計 + パートの中の位置）
 */
export const calculateBlockPositionMs = (block: TimelineBlock, partIndex: number, positionMs: number): number =>
  sumDurations(block.parts.slice(0, partIndex)) + positionMs

/**
 * ミニプレーヤーの進捗（0〜1）。全文は本文全体、段落はそのブロックの中での位置
 */
export const calculateReadAloudProgress = (timeline: ReadAloudTimeline, position: ReadAloudPosition): number => {
  const blockOrder = timeline.blocks.findIndex(block => block.blockIndex === position.blockIndex)
  const block = timeline.blocks[blockOrder]
  if (block === undefined) return 0
  const blockPositionMs = calculateBlockPositionMs(block, position.partIndex, position.positionMs)
  const [elapsedMs, totalMs] = position.mode === "block"
    ? [blockPositionMs, block.durationMs]
    : [sumDurations(timeline.blocks.slice(0, blockOrder)) + blockPositionMs, timeline.totalDurationMs]
  return totalMs > 0 ? Math.min(Math.max(elapsedMs / totalMs, 0), 1) : 0
}
