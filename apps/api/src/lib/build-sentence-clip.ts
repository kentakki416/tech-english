import type { PassageAudioManifest } from "@repo/domain"

/**
 * 1 文の読み上げの区間（パートの mp3 のキーと、その中の始めと終わりのミリ秒）
 */
export type SentenceClip = { endMs: number; key: string; startMs: number }

/**
 * 読み上げのマニフェストから、ブロックの [startOffset, endOffset) に収まる単語の区間を求める（vocabulary-pronunciation README「1 文の区間の求め方」）。
 * 単語の位置はブロックの本文上の UTF-16 の位置（PassageAudioManifest と同じ）。範囲の境目にかかる単語は含めない。
 * ブロックが無い・単語が無い・範囲の単語が 2 つのパートにまたがる（3,000 文字を超えるブロックを分けた境目。まれ）ときは null
 */
export const buildSentenceClip = (
  manifest: PassageAudioManifest,
  location: { blockIndex: number; endOffset: number; startOffset: number },
): SentenceClip | null => {
  const block = manifest.blocks.find((item) => item.blockIndex === location.blockIndex)
  if (!block) return null
  const hits = block.parts.flatMap((part) =>
    part.words
      .filter(([, , start, end]) => start >= location.startOffset && end <= location.endOffset)
      .map((word) => ({ key: part.key, word })),
  )
  const first = hits[0]
  const last = hits[hits.length - 1]
  if (!first || !last || first.key !== last.key) return null
  return { endMs: last.word[1], key: first.key, startMs: first.word[0] }
}
