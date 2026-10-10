import { pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"

/**
 * ユーザー（認証プロバイダー非依存）
 *
 * 制約・index 名は Prisma のマイグレーションと同じにしている（既存 DB と定義を一致させるため）。
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    avatarUrl: text("avatar_url"),
    email: text("email"),
    name: text("name"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_key").on(table.email)],
)
