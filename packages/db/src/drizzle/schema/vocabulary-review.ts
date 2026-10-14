import { sql } from "drizzle-orm"
import { check, date, foreignKey, index, integer, pgTable, serial, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { VOCABULARY_GRADES, VOCABULARY_MASTERED_STAGE, VOCABULARY_MAX_CARD_SECONDS } from "@repo/domain"

import { timestamps } from "./columns"
import { joinSqlValues } from "./sql-values"
import { users } from "./user"
import { vocabularyCards } from "./vocabulary-card"

/**
 * 単語帳の 1 枚ごとの答え。学習記録の集計（学習した日・学習時間）と、答えの保存の冪等の判定に使う
 *
 * 列の正本は docs/spec/vocabulary-cards/README.md の「必要な DB 設計」。
 * users と vocabulary_cards の削除で cascade する。制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const vocabularyReviews = pgTable(
  "vocabulary_reviews",
  {
    id: serial("id").primaryKey(),
    /**
     * カードを見ていた秒数。クライアントの申告値を 0〜VOCABULARY_MAX_CARD_SECONDS に切り詰めた値
     */
    activeSeconds: smallint("active_seconds").notNull(),
    cardId: integer("card_id").notNull(),
    /**
     * クライアントが作る UUID。通信のやり直しで同じ答えを 2 回反映しないため
     */
    clientReviewId: uuid("client_review_id").notNull(),
    grade: text("grade", { enum: VOCABULARY_GRADES }).notNull(),
    stageAfter: smallint("stage_after").notNull(),
    /**
     * 新しい単語（答える前にカードが無かった）は NULL
     */
    stageBefore: smallint("stage_before"),
    /**
     * 答えた時点の users.timezone での日付。学習記録の日付はこの列で決まる
     */
    studyDate: date("study_date", { mode: "string" }).notNull(),
    userId: integer("user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "vocabulary_reviews_user_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.cardId],
      foreignColumns: [vocabularyCards.id],
      name: "vocabulary_reviews_card_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * 冪等の判定。ユーザーごとに一意にして、他のユーザーの答えと衝突しないようにする
     */
    uniqueIndex("vocabulary_reviews_user_id_client_review_id_key").on(table.userId, table.clientReviewId),
    /**
     * 学習記録の集計（study_date ごと）
     */
    index("vocabulary_reviews_user_id_study_date_idx").on(table.userId, table.studyDate),
    index("vocabulary_reviews_card_id_idx").on(table.cardId),
    check("vocabulary_reviews_grade_check", sql`${table.grade} IN (${joinSqlValues(VOCABULARY_GRADES)})`),
    check(
      "vocabulary_reviews_active_seconds_check",
      sql`${table.activeSeconds} BETWEEN 0 AND ${VOCABULARY_MAX_CARD_SECONDS}`,
    ),
    check("vocabulary_reviews_stage_after_check", sql`${table.stageAfter} BETWEEN 0 AND ${VOCABULARY_MASTERED_STAGE}`),
    check(
      "vocabulary_reviews_stage_before_check",
      sql`${table.stageBefore} IS NULL OR ${table.stageBefore} BETWEEN 0 AND ${VOCABULARY_MASTERED_STAGE}`,
    ),
  ],
)
