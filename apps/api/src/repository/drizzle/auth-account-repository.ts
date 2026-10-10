import { and, authAccounts, DrizzleClient, eq, users } from "@repo/db"
import { AuthAccount, AuthAccountWithUser, User } from "@repo/domain"

import type { AuthAccountRepository, CreateAuthAccountInput } from "../auth-account-repository"
import type { TransactionContext } from "../transaction"

import { resolveDrizzleClient } from "./transaction-runner"

/**
 * Drizzleの型
 */
type AuthAccountRow = typeof authAccounts.$inferSelect
type UserRow = typeof users.$inferSelect

/**
 * Drizzle実装の認証アカウントリポジトリ
 */
export class DrizzleAuthAccountRepository implements AuthAccountRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findByProvider(
    provider: string,
    providerAccountId: string
  ): Promise<AuthAccountWithUser | null> {
    const [row] = await this._db
      .select({
        authAccount: authAccounts,
        user: users,
      })
      .from(authAccounts)
      .innerJoin(users, eq(authAccounts.userId, users.id))
      .where(
        and(
          eq(authAccounts.provider, provider),
          eq(authAccounts.providerAccountId, providerAccountId),
        ),
      )

    if (!row) return null

    return {
      ...this._toDomainAuthAccount(row.authAccount),
      user: this._toDomainUser(row.user),
    }
  }

  public async create(data: CreateAuthAccountInput, tx?: TransactionContext): Promise<AuthAccount> {
    const client = resolveDrizzleClient(this._db, tx)
    const [row] = await client
      .insert(authAccounts)
      .values({
        provider: data.provider,
        providerAccountId: data.providerAccountId,
        userId: data.userId,
      })
      .returning()

    return this._toDomainAuthAccount(row)
  }

  /**
   * Drizzleの型 → ドメインの型に変換
   */
  private _toDomainUser(row: UserRow): User {
    return {
      avatarUrl: row.avatarUrl,
      createdAt: row.createdAt,
      email: row.email,
      id: row.id,
      name: row.name,
      updatedAt: row.updatedAt,
    }
  }

  private _toDomainAuthAccount(row: AuthAccountRow): AuthAccount {
    return {
      createdAt: row.createdAt,
      id: row.id,
      provider: row.provider,
      providerAccountId: row.providerAccountId,
      updatedAt: row.updatedAt,
      userId: row.userId,
    }
  }
}
