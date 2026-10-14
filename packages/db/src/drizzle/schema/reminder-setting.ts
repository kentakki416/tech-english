import { boolean, foreignKey, integer, jsonb, pgTable, serial, time, uniqueIndex } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"
import { users } from "./user"

/**
 * 学習リマインダーの設定（docs/spec/study-reminder）。1 ユーザー 1 行
 *
 * weekdays の値域（1〜7・1 つ以上・重複なし）と time の 15 分刻みは API の Zod で検証する。
 * 既定値は DB に持たせない（未保存のユーザーには API が既定値を返す。既定値を 2 か所に書かない）。
 * users の削除で cascade する（アカウント削除で設定も消すため）。制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const reminderSettings = pgTable(
  "reminder_settings",
  {
    id: serial("id").primaryKey(),
    isEnabled: boolean("is_enabled").notNull(),
    /**
     * 端末の時刻。秒は使わないので precision 0。Postgres は "21:00:00" の形で返す
     */
    time: time("time", { precision: 0 }).notNull(),
    userId: integer("user_id").notNull(),
    /**
     * ISO の曜日番号（1 = 月曜 〜 7 = 日曜）の配列
     */
    weekdays: jsonb("weekdays").$type<number[]>().notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "reminder_settings_user_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("reminder_settings_user_id_key").on(table.userId),
  ],
)
