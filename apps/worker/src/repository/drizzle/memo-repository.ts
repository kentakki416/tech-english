import { DrizzleClient, eq, memos } from "@repo/db"
import type { Memo } from "@repo/domain"

import type { MemoRepository } from "../memo-repository"

type MemoRow = typeof memos.$inferSelect

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
