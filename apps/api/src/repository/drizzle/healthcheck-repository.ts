import { DrizzleClient, sql } from "@repo/db"

import type { DatabaseHealthRepository } from "../database-health-repository"

/**
 * Drizzle実装のデータベースヘルスチェックリポジトリ
 */
export class DrizzleDatabaseHealthRepository implements DatabaseHealthRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async ping(): Promise<void> {
    await this._db.execute(sql`SELECT 1`)
  }
}
