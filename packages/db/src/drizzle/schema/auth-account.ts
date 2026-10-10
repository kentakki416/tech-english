import { foreignKey, index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"
import { users } from "./user"

/**
 * 認証アカウント（複数プロバイダー対応、 (provider, providerAccountId) で一意）
 *
 * OAuth プロバイダの access_token / refresh_token 等は本アプリでは保持しない
 * （プロバイダ側で発行・管理し、アプリは取得した user info を DB に保存後は内部 JWT で完結する）。
 * 制約・index 名は Prisma のマイグレーションと同じにしている（既存 DB と定義を一致させるため）。
 */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: serial("id").primaryKey(),
    /**
     * "google" | "github" | "credentials" | "dev" など
     */
    provider: text("provider").notNull(),
    /**
     * プロバイダー側のユーザー ID
     */
    providerAccountId: text("provider_account_id").notNull(),
    userId: integer("user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "auth_accounts_user_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("auth_accounts_user_id_idx").on(table.userId),
    uniqueIndex("auth_accounts_provider_provider_account_id_key").on(table.provider, table.providerAccountId),
  ],
)
