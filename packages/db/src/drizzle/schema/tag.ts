import { sql } from "drizzle-orm"
import { check, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core"

import { TAG_COLORS } from "@repo/domain"

import { timestamps } from "./columns"
import { joinSqlValues } from "./sql-values"

/**
 * ソースの技術タグ。管理者が admin の「タグ」で登録し、ソースには source_tags で付ける
 *
 * 大文字・小文字だけが違う名前（React と react）は lower(name) の unique index で拒否する。
 * 列の正本は docs/spec/source-tags/README.md の「必要な DB 設計」。制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    /**
     * TAG_COLORS（Tailwind の既定のパレットの色の名前）
     */
    color: text("color", { enum: TAG_COLORS }).notNull(),
    /**
     * 表示名。登録したとおりの書き方
     */
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    check("tags_color_check", sql`${table.color} IN (${joinSqlValues(TAG_COLORS)})`),
    /**
     * api-schema の検証（trim・1〜30 文字・カンマ禁止）と同じ。カンマはユーザーの問題一覧の URL の区切り（?tag=react,rust）
     */
    check(
      "tags_name_check",
      sql`${table.name} = btrim(${table.name}) AND char_length(${table.name}) BETWEEN 1 AND 30 AND strpos(${table.name}, ',') = 0`,
    ),
    uniqueIndex("tags_name_lower_key").on(sql`lower(${table.name})`),
  ],
)
