import { DrizzleClient, eq, memos } from "@repo/db"
import type { Memo } from "@repo/domain"

import type { MemoRepository } from "../memo-repository"

/**
 * Drizzle の行の型
 */
type MemoRow = typeof memos.$inferSelect

/**
 * Drizzle 実装の MemoRepository
 */
export class DrizzleMemoRepository implements MemoRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findById(id: number): Promise<Memo | null> {
    const [row] = await this._db.select().from(memos).where(eq(memos.id, id))
    if (!row) return null
    return this._toDomainMemo(row)
  }

  /**
   * Drizzle の型 → ドメインの型に変換
   */
  private _toDomainMemo(row: MemoRow): Memo {
    return {
      id: row.id,
      body: row.body,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
