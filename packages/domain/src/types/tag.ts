import type { TAG_COLORS } from "../const/tag"

/**
 * タグの色
 */
export type TagColor = (typeof TAG_COLORS)[number]

/**
 * ソースの技術タグ
 */
export type Tag = {
  id: number
  color: TagColor
  /**
   * 表示名。登録したとおりの書き方（大文字・小文字だけが違う名前は登録できない）
   */
  name: string
  createdAt: Date
  updatedAt: Date
}
