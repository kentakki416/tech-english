import { sql } from "drizzle-orm"
import { check, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"

/**
 * 英和辞書（EJDict-hand）。用語集に無い単語の意味を引く。drizzle/seed-dictionary.ts で投入する
 *
 * このファイルは @repo/domain を import しない（seed-dictionary.ts が migration イメージで
 * @repo/domain のビルド無しに読み込むため）。制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const dictionaryEntries = pgTable(
  "dictionary_entries",
  {
    id: serial("id").primaryKey(),
    /**
     * 見出し語。小文字で持ち、引くときも小文字化して完全一致で探す
     */
    headword: text("headword").notNull(),
    meaningJa: text("meaning_ja").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("dictionary_entries_headword_key").on(table.headword),
    check("dictionary_entries_headword_check", sql`${table.headword} = lower(${table.headword})`),
  ],
)
