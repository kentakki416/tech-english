import type { tags } from "@repo/db"
import type { Tag } from "@repo/domain"

export type TagRow = typeof tags.$inferSelect

export const convertTagRowToDomain = (row: TagRow): Tag => ({
  id: row.id,
  color: row.color,
  name: row.name,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})
