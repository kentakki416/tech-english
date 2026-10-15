import { TAG_COLORS } from "../const/tag"
import type { TagColor } from "../types/tag"

/**
 * タグの色の値かどうか
 */
export const isTagColor = (value: string): value is TagColor =>
  (TAG_COLORS as readonly string[]).includes(value)

/**
 * タグを作るときに自動で割り当てる色。今のタグの色の一覧（usedColors）のうち、使われている数が最も少ない色を返す。
 * 同じ数の色が複数あれば TAG_COLORS の先頭に近い方
 */
export const selectTagColor = (usedColors: readonly TagColor[]): TagColor => {
  const counts = new Map<TagColor, number>(TAG_COLORS.map((color) => [color, 0]))
  for (const color of usedColors) {
    counts.set(color, (counts.get(color) ?? 0) + 1)
  }
  /**
   * 先頭から見て、より少ない色に出会ったときだけ入れ替える。同じ数なら先に見た（先頭に近い）色が残る
   */
  return TAG_COLORS.reduce((selected, color) =>
    (counts.get(color) ?? 0) < (counts.get(selected) ?? 0) ? color : selected,
  )
}
