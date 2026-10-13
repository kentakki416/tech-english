import { sql } from "drizzle-orm"
import { check, foreignKey, integer, jsonb, pgTable, serial, smallint, text, uniqueIndex } from "drizzle-orm/pg-core"

import { QUESTION_CHOICE_COUNT, QUESTION_TYPES } from "@repo/domain"

import { timestamps } from "./columns"
import { passages } from "./passage"
import { passageGlossaryEntries } from "./passage-glossary-entry"
import { joinSqlValues } from "./sql-values"

/**
 * 設問。設問文と選択肢は英語、解説は日本語
 *
 * 列の正本は docs/spec/question-generation/README.md の「必要な DB 設計」（verification_choice_index は step1 で追加した列）。
 * 制約・index 名は Prisma の既定の命名に合わせている。
 */
export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    /**
     * 4 つ。表示順のまま（A〜D）
     */
    choices: jsonb("choices").$type<string[]>().notNull(),
    correctChoiceIndex: smallint("correct_choice_index").notNull(),
    evidenceBlockIndex: integer("evidence_block_index").notNull(),
    /**
     * 根拠（本文中の該当箇所の引用）
     */
    evidenceQuote: text("evidence_quote").notNull(),
    explanationJa: text("explanation_ja").notNull(),
    /**
     * 範囲の CHECK は付けない（保存で並べ替えるとき、unique 制約を避けるために一時的に負の値へ退避するため）
     */
    orderIndex: smallint("order_index").notNull(),
    passageId: integer("passage_id").notNull(),
    prompt: text("prompt").notNull(),
    /**
     * vocabulary のときだけ。用語集の項目
     */
    targetGlossaryEntryId: integer("target_glossary_entry_id"),
    type: text("type", { enum: QUESTION_TYPES }).notNull(),
    /**
     * 解答キーを見ない検証で検証モデルが選んだ選択肢。検証していない設問は NULL
     */
    verificationChoiceIndex: smallint("verification_choice_index"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.passageId],
      foreignColumns: [passages.id],
      name: "questions_passage_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * 用語集の項目を消したら紐づけだけ外す（公開の検査で「対象語句なし」として検出される）
     */
    foreignKey({
      columns: [table.targetGlossaryEntryId],
      foreignColumns: [passageGlossaryEntries.id],
      name: "questions_target_glossary_entry_id_fkey",
    })
      .onDelete("set null")
      .onUpdate("cascade"),
    uniqueIndex("questions_passage_id_order_index_key").on(table.passageId, table.orderIndex),
    check("questions_type_check", sql`${table.type} IN (${joinSqlValues(QUESTION_TYPES)})`),
    check(
      "questions_correct_choice_index_check",
      sql`${table.correctChoiceIndex} BETWEEN 0 AND ${QUESTION_CHOICE_COUNT - 1}`,
    ),
    check(
      "questions_target_glossary_entry_check",
      sql`${table.targetGlossaryEntryId} IS NULL OR ${table.type} = 'vocabulary'`,
    ),
  ],
)
