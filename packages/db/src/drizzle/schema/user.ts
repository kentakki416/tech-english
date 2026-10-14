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
    /**
     * IANA タイムゾーン名（例: Asia/Tokyo）。学習日の判定に使う。
     * 値の検証は API の入力時に行い、DB の CHECK 制約にはしない（IANA の一覧が更新されるため）
     */
    timezone: text("timezone").notNull().default("Asia/Tokyo"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_key").on(table.email)],
)
