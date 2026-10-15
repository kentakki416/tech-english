import { sql } from "drizzle-orm"
import { check, date, foreignKey, index, integer, pgTable, serial, smallint, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { VOCABULARY_MASTERED_STAGE } from "@repo/domain"

import { timestamps } from "./columns"
import { users } from "./user"

/**
 * 単語帳のカード（復習の状態）。1 ユーザー・1 見出し語で 1 行。初めて答えたときに作る
 *
 * 表と裏の中身（語句・1 文・意味）は持たず、出すたびに attempt_word_lookups / passage_glossary_entries から組み立てる。
 * 列の正本は docs/spec/vocabulary-cards/README.md の「必要な DB 設計」。
 * users の削除で cascade する。
 */
export const vocabularyCards = pgTable(
  "vocabulary_cards",
  {
    id: serial("id").primaryKey(),
    /**
     * 次に出す日（users.timezone での日付）。段階 4（覚えた単語）は NULL
     */
    dueDate: date("due_date", { mode: "string" }),
    lastReviewedAt: timestamp("last_reviewed_at", { mode: "date", precision: 3 }).notNull(),
    /**
     * 見出し語の小文字（normalizeVocabularyLemma）
     */
    lemma: text("lemma").notNull(),
    /**
     * 0〜4（VOCABULARY_MASTERED_STAGE）
     */
    stage: smallint("stage").notNull(),
    userId: integer("user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "vocabulary_cards_user_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("vocabulary_cards_user_id_lemma_key").on(table.userId, table.lemma),
    /**
     * 今日の復習（due_date <= 今日）を引くため
     */
    index("vocabulary_cards_user_id_due_date_idx").on(table.userId, table.dueDate),
    check("vocabulary_cards_lemma_check", sql`${table.lemma} = lower(${table.lemma})`),
    check("vocabulary_cards_stage_check", sql`${table.stage} BETWEEN 0 AND ${VOCABULARY_MASTERED_STAGE}`),
    /**
     * 次に出す日が無いのは覚えた単語だけ
     */
    check(
      "vocabulary_cards_due_date_check",
      sql`(${table.stage} = ${VOCABULARY_MASTERED_STAGE}) = (${table.dueDate} IS NULL)`,
    ),
  ],
)
