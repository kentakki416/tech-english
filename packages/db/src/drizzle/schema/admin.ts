import { sql } from "drizzle-orm"
import { check, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"

/**
 * 管理画面にサインインできる人（事前登録制。users とは関係を持たない）
 *
 * 行は admin:create コマンド（ローカルは seed）で作る。サインインのたびに name / avatar_url（Google のもの）と
 * last_signed_in_at を更新する。列の正本は docs/spec/admin-template/README.md の「必要な DB 設計」
 */
export const admins = pgTable(
  "admins",
  {
    id: serial("id").primaryKey(),
    avatarUrl: text("avatar_url"),
    email: text("email").notNull(),
    lastSignedInAt: timestamp("last_signed_in_at", { mode: "date", precision: 3 }),
    name: text("name"),
    ...timestamps,
  },
  (table) => [
    /**
     * normalizeEmail（@repo/domain）と同じ形だけを許す。admin:create と seed の外（SQL を直接流すなど）で入れても、
     * サインインの照合とずれて誰も入れない行にならないようにする
     */
    check("admins_email_check", sql`${table.email} = lower(btrim(${table.email}))`),
    uniqueIndex("admins_email_key").on(table.email),
  ],
)
