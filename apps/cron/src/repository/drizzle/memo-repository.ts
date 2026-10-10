import { DrizzleClient, lt, memos } from "@repo/db"

import type { MemoRepository } from "../memo-repository"

/**
 * Drizzle 実装の MemoRepository
 */
export class DrizzleMemoRepository implements MemoRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async deleteOlderThan(threshold: Date): Promise<number> {
    const result = await this._db.delete(memos).where(lt(memos.createdAt, threshold))
    return result.rowCount ?? 0
  }
}
