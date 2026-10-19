import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { ATTEMPT_STATUSES } from "@repo/domain"

import { timestamps } from "./columns"
import { passages } from "./passage"
import { joinSqlValues } from "./sql-values"
import { users } from "./user"

/**
 * 挑戦。提出時に採点結果と時間を入れる（in_progress / expired の間は NULL）
 *
 * 列の正本は docs/spec/reading-practice/README.md の「必要な DB 設計」。
 * users の削除で cascade する（アカウント削除で学習の記録をすべて消すため）。制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const readingAttempts = pgTable(
  "reading_attempts",
  {
    id: serial("id").primaryKey(),
    correctCount: smallint("correct_count"),
    /**
     * 画面を見ていた時間（秒）。クライアントの申告値を 0 〜 提出時刻 − started_at に切り詰めた値
     */
    elapsedSeconds: integer("elapsed_seconds"),
    isOvertime: boolean("is_overtime"),
    /**
     * 解答中に読み上げを聞いた段落の数（docs/spec/read-aloud/README.md）
     */
    listenedBlockCount: smallint("listened_block_count").notNull().default(0),
    passageId: integer("passage_id").notNull(),
    questionCount: smallint("question_count"),
    startedAt: timestamp("started_at", { mode: "date", precision: 3 }).notNull(),
    status: text("status", { enum: ATTEMPT_STATUSES }).notNull().default("in_progress"),
    /**
     * 提出時に users.timezone で求めた日付（YYYY-MM-DD）。学習記録の日付はこの列だけで決まる
     */
    studyDate: date("study_date", { mode: "string" }),
    submittedAt: timestamp("submitted_at", { mode: "date", precision: 3 }),
    /**
     * 開始時点の制限時間
     */
    timeLimitSeconds: integer("time_limit_seconds").notNull(),
    translatedBlockCount: smallint("translated_block_count").notNull().default(0),
    /**
     * 和訳を一度でも出した設問の数（docs/spec/question-translation/README.md）
     */
    translatedQuestionCount: smallint("translated_question_count").notNull().default(0),
    userId: integer("user_id").notNull(),
    wordLookupCount: smallint("word_lookup_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "reading_attempts_user_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * passages は物理削除しないので restrict
     */
    foreignKey({
      columns: [table.passageId],
      foreignColumns: [passages.id],
      name: "reading_attempts_passage_id_fkey",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    check("reading_attempts_status_check", sql`${table.status} IN (${joinSqlValues(ATTEMPT_STATUSES)})`),
    /**
     * submitted なら採点結果と時間が必ずある
     */
    check(
      "reading_attempts_submitted_columns_check",
      sql`${table.status} <> 'submitted' OR (${table.submittedAt} IS NOT NULL AND ${table.elapsedSeconds} IS NOT NULL AND ${table.isOvertime} IS NOT NULL AND ${table.questionCount} IS NOT NULL AND ${table.correctCount} IS NOT NULL AND ${table.studyDate} IS NOT NULL)`,
    ),
    /**
     * 1 ユーザー × 1 問題につき in_progress は最大 1 つ
     */
    uniqueIndex("reading_attempts_user_id_passage_id_in_progress_key")
      .on(table.userId, table.passageId)
      .where(sql`${table.status} = 'in_progress'`),
    /**
     * カレンダーの集計
     */
    index("reading_attempts_user_id_study_date_idx").on(table.userId, table.studyDate),
    /**
     * 問題一覧の挑戦状況
     */
    index("reading_attempts_user_id_passage_id_idx").on(table.userId, table.passageId),
    /**
     * admin のダッシュボード：期間内の提出（全体の利用状況）
     */
    index("reading_attempts_submitted_at_idx")
      .on(table.submittedAt)
      .where(sql`${table.status} = 'submitted'`),
    /**
     * admin のダッシュボード：問題ごとの成績・問題の分析
     */
    index("reading_attempts_passage_id_submitted_at_idx")
      .on(table.passageId, table.submittedAt)
      .where(sql`${table.status} = 'submitted'`),
  ],
)
