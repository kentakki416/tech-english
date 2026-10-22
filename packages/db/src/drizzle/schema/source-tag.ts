import { foreignKey, index, integer, pgTable, primaryKey } from "drizzle-orm/pg-core"

import { sources } from "./source"
import { tags } from "./tag"

/**
 * ソースとタグの紐付け。ソースかタグを消すと紐付けも消える（CASCADE）
 *
 * 紐付けた時刻は使わないので timestamps は持たない。
 */
export const sourceTags = pgTable(
  "source_tags",
  {
    sourceId: integer("source_id").notNull(),
    tagId: integer("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.tagId], name: "source_tags_pkey" }),
    foreignKey({
      columns: [table.sourceId],
      foreignColumns: [sources.id],
      name: "source_tags_source_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * タグを消すとソースから外れる（admin の削除の確認で件数を出してから消す）
     */
    foreignKey({
      columns: [table.tagId],
      foreignColumns: [tags.id],
      name: "source_tags_tag_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * タグを使っているソースの数を数える・タグで問題を絞り込むため（主キーの先頭は source_id なので tag_id からは引けない）
     */
    index("source_tags_tag_id_idx").on(table.tagId),
  ],
)
