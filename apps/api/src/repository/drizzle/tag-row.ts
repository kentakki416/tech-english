import type { tags } from "@repo/db"
import type { Tag } from "@repo/domain"

/**
 * Drizzleの型
 */
export type TagRow = typeof tags.$inferSelect

/**
 * Drizzleの型 → ドメインの型。TagRepository と SourceRepository（ソースのタグ）で共有する
 */
export const convertTagRowToDomain = (row: TagRow): Tag => ({
  id: row.id,
  color: row.color,
  name: row.name,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})
