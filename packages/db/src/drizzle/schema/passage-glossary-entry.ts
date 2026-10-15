import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, pgTable, serial, text } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"
import { passages } from "./passage"

/**
 * 用語集（本文中の難しい単語・熟語と、この文脈での意味）
 *
 * 位置は passages.blocks[block_index].text（インラインコードのバッククォートを含む生の文字列）上の
 * UTF-16 の index で、[start_offset, end_offset)。管理者が英文を修正すると位置がずれるので、保存時に再計算する。
 * 列の正本は docs/spec/question-generation/README.md の「必要な DB 設計」。
 */
export const passageGlossaryEntries = pgTable(
  "passage_glossary_entries",
  {
    id: serial("id").primaryKey(),
    blockIndex: integer("block_index").notNull(),
    /**
     * end は含まない
     */
    endOffset: integer("end_offset").notNull(),
    lemma: text("lemma").notNull(),
    meaningJa: text("meaning_ja").notNull(),
    noteJa: text("note_ja"),
    partOfSpeech: text("part_of_speech"),
    passageId: integer("passage_id").notNull(),
    startOffset: integer("start_offset").notNull(),
    surface: text("surface").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.passageId],
      foreignColumns: [passages.id],
      name: "passage_glossary_entries_passage_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("passage_glossary_entries_passage_id_idx").on(table.passageId),
    /**
     * 将来の単語問題で語彙を横断して引くため
     */
    index("passage_glossary_entries_lemma_idx").on(table.lemma),
    check(
      "passage_glossary_entries_offset_check",
      sql`${table.startOffset} >= 0 AND ${table.endOffset} > ${table.startOffset}`,
    ),
  ],
)
