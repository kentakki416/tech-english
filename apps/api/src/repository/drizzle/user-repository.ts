import { DrizzleClient, eq, users } from "@repo/db"
import { User } from "@repo/domain"

import type { TransactionContext } from "../transaction"
import type { CreateUserInput, UserRepository } from "../user-repository"

import { resolveDrizzleClient } from "./transaction-runner"

/**
 * Drizzleの型
 */
type UserRow = typeof users.$inferSelect

/**
 * Drizzle実装のユーザーリポジトリ
 */
export class DrizzleUserRepository implements UserRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findById(id: number): Promise<User | null> {
    const [row] = await this._db.select().from(users).where(eq(users.id, id))
    if (!row) return null
    return this._toDomainUser(row)
  }

  public async findByEmail(email: string): Promise<User | null> {
    const [row] = await this._db.select().from(users).where(eq(users.email, email))
    if (!row) return null
    return this._toDomainUser(row)
  }

  public async create(data: CreateUserInput, tx?: TransactionContext): Promise<User> {
    const client = resolveDrizzleClient(this._db, tx)
    const [row] = await client
      .insert(users)
      .values({
        avatarUrl: data.avatarUrl,
        email: data.email,
        name: data.name,
      })
      .returning()
    return this._toDomainUser(row)
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
}
