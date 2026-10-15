import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, pgTable, serial, text } from "drizzle-orm/pg-core"

import { WORD_LOOKUP_SOURCES } from "@repo/domain"

import { timestamps } from "./columns"
import { passages } from "./passage"
import { passageGlossaryEntries } from "./passage-glossary-entry"
import { readingAttempts } from "./reading-attempt"
import { joinSqlValues } from "./sql-values"
import { users } from "./user"

/**
 * 調べた単語。結果画面の一覧と、将来の単語帳・単語問題に使う
 *
 * users と reading_attempts の削除で cascade する。
 */
export const attemptWordLookups = pgTable(
  "attempt_word_lookups",
  {
    id: serial("id").primaryKey(),
    attemptId: integer("attempt_id").notNull(),
    /**
     * 用語集から引いた場合だけ
     */
    glossaryEntryId: integer("glossary_entry_id"),
    lemma: text("lemma").notNull(),
    passageId: integer("passage_id").notNull(),
    source: text("source", { enum: WORD_LOOKUP_SOURCES }).notNull(),
    surface: text("surface").notNull(),
    userId: integer("user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.attemptId],
      foreignColumns: [readingAttempts.id],
      name: "attempt_word_lookups_attempt_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "attempt_word_lookups_user_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * passages は物理削除しないので restrict
     */
    foreignKey({
      columns: [table.passageId],
      foreignColumns: [passages.id],
      name: "attempt_word_lookups_passage_id_fkey",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    /**
     * 非公開に戻した問題の用語集を管理者が消しても、調べた記録は語句と見出し語で残す
     */
    foreignKey({
      columns: [table.glossaryEntryId],
      foreignColumns: [passageGlossaryEntries.id],
      name: "attempt_word_lookups_glossary_entry_id_fkey",
    })
      .onDelete("set null")
      .onUpdate("cascade"),
    check("attempt_word_lookups_source_check", sql`${table.source} IN (${joinSqlValues(WORD_LOOKUP_SOURCES)})`),
    index("attempt_word_lookups_user_id_lemma_idx").on(table.userId, table.lemma),
    index("attempt_word_lookups_attempt_id_idx").on(table.attemptId),
  ],
)
