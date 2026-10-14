import type { PassageAudioManifest } from "@repo/domain"

/**
 * 1 パートの mp3 の保存キー（passages/{passageId}/{textHash}/{blockIndex}-{partIndex}.mp3）。
 * 本文と voice のハッシュを含むので、内容が変わればキーも変わる（CDN の長期キャッシュに古い音声が残らない）。
 * revision（作り直しの依頼で本文の hash が前と同じときの確保の時刻のミリ秒）があれば passages/{passageId}/{textHash}-r{revision}/... にする
 * （同じキーに上書きすると、CDN の長期キャッシュ〈1 年・immutable〉に作り直す前の音声が残るため）
 */
export const buildAudioKey = (input: {
  blockIndex: number
  partIndex: number
  passageId: number
  revision?: number
  textHash: string
}): string => {
  const directory = input.revision === undefined ? input.textHash : `${input.textHash}-r${input.revision}`
  return `passages/${input.passageId}/${directory}/${input.blockIndex}-${input.partIndex}.mp3`
}

const listAudioKeys = (manifest: PassageAudioManifest | null): string[] =>
  manifest ? manifest.blocks.flatMap((block) => block.parts.map((part) => part.key)) : []

/**
 * from のマニフェストにあって keep のマニフェストに無いキー（消してよい mp3）
 */
export const listUnusedAudioKeys = (from: PassageAudioManifest | null, keep: PassageAudioManifest | null): string[] => {
  const keptKeys = new Set(listAudioKeys(keep))
  return listAudioKeys(from).filter((key) => !keptKeys.has(key))
}
