import { sql } from "drizzle-orm"
import { boolean, check, foreignKey, integer, pgTable, serial, smallint, uniqueIndex } from "drizzle-orm/pg-core"

import { QUESTION_CHOICE_COUNT } from "@repo/domain"

import { timestamps } from "./columns"
import { questions } from "./question"
import { readingAttempts } from "./reading-attempt"

/**
 * 設問ごとの回答と正誤。提出時点の正誤を固定して保存する（後から管理者が正解を直しても過去の点数は変わらない）
 *
 * 制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const attemptAnswers = pgTable(
  "attempt_answers",
  {
    id: serial("id").primaryKey(),
    attemptId: integer("attempt_id").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    questionId: integer("question_id").notNull(),
    /**
     * NULL は未回答
     */
    selectedChoiceIndex: smallint("selected_choice_index"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.attemptId],
      foreignColumns: [readingAttempts.id],
      name: "attempt_answers_attempt_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * 挑戦された設問は削除できない（question-generation「公開済みの問題を直すとき」）
     */
    foreignKey({
      columns: [table.questionId],
      foreignColumns: [questions.id],
      name: "attempt_answers_question_id_fkey",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    uniqueIndex("attempt_answers_attempt_id_question_id_key").on(table.attemptId, table.questionId),
    check(
      "attempt_answers_selected_choice_index_check",
      sql`${table.selectedChoiceIndex} IS NULL OR ${table.selectedChoiceIndex} BETWEEN 0 AND ${QUESTION_CHOICE_COUNT - 1}`,
    ),
  ],
)
