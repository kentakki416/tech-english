import { inArray, sourceTags, sql, tags } from "@repo/db"
import { TAG_COLORS } from "@repo/domain"

import { testDb } from "../controller/setup"

type TagRow = typeof tags.$inferSelect

/**
 * ソースのタグ（tags / source_tags）を DB に入れるテスト用のヘルパー。Repository のテストと Controller のインテグレーションテストで使う
 */

/**
 * タグを入れる（ソースには付けない）。色は TAG_COLORS を names の順に使う。
 * 同じ名前（大文字・小文字を区別しない）のタグがあれば作らずにそれを使う。タグの行を names の順で返す
 */
export const insertTags = async (names: string[]): Promise<TagRow[]> => {
  if (names.length === 0) return []
  await testDb
    .insert(tags)
    .values(names.map((name, index) => ({ color: TAG_COLORS[index % TAG_COLORS.length], name })))
    .onConflictDoNothing()
  const rows = await testDb
    .select()
    .from(tags)
    .where(inArray(sql`lower(${tags.name})`, names.map((name) => name.toLowerCase())))
  const rowByLowerName = new Map(rows.map((row) => [row.name.toLowerCase(), row]))
  return names.flatMap((name) => rowByLowerName.get(name.toLowerCase()) ?? [])
}

/**
 * ソースにタグ（名前で指定）を付ける。tags に無い名前は insertTags で作る。付けたタグの行を names の順で返す
 */
export const insertSourceTags = async (sourceId: number, names: string[]): Promise<TagRow[]> => {
  const rows = await insertTags(names)
  if (rows.length === 0) return []
  await testDb.insert(sourceTags).values(rows.map((row) => ({ sourceId: sourceId, tagId: row.id })))
  return rows
}
