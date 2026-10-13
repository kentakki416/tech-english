import { sql } from "drizzle-orm"
import { check, date, foreignKey, integer, pgTable, serial, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"

import { GOAL_METRICS, GOAL_TEXT_MAX_LENGTH } from "@repo/domain"

import { timestamps } from "./columns"
import { joinSqlValues } from "./sql-values"
import { users } from "./user"

/**
 * ユーザーの目標（1 ユーザー 1 行）。項目はどれも任意
 *
 * 列の正本は docs/spec/learning-record/README.md の「必要な DB 設計」。
 * users の削除で cascade する（アカウント削除で目標も消すため）。制約・index 名は Prisma の既定の命名に合わせている。
 */
export const userGoals = pgTable(
  "user_goals",
  {
    id: serial("id").primaryKey(),
    goalText: varchar("goal_text", { length: GOAL_TEXT_MAX_LENGTH }),
    /**
     * `mode: "string"` で `YYYY-MM-DD` のまま読み書きする
     */
    targetDate: date("target_date", { mode: "string" }),
    userId: integer("user_id").notNull(),
    weeklyMetric: text("weekly_metric", { enum: GOAL_METRICS }),
    /**
     * 1 以上。passages は問題数、minutes は分
     */
    weeklyTarget: integer("weekly_target"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "user_goals_user_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("user_goals_user_id_key").on(table.userId),
    check("user_goals_weekly_metric_check", sql`${table.weeklyMetric} IN (${joinSqlValues(GOAL_METRICS)})`),
    /**
     * 週の目標の指標と値は両方あるか両方 NULL
     */
    check("user_goals_weekly_pair_check", sql`(${table.weeklyMetric} IS NULL) = (${table.weeklyTarget} IS NULL)`),
    check("user_goals_weekly_target_check", sql`${table.weeklyTarget} >= 1`),
  ],
)
