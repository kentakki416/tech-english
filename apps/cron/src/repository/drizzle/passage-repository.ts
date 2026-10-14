import { DrizzleClient, passages } from "@repo/db"

import type { CreatePassageInput, PassageRepository } from "../passage-repository"

/**
 * Drizzle 実装の PassageRepository
 */
export class DrizzlePassageRepository implements PassageRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  /**
   * ON CONFLICT (content_hash) DO NOTHING で挿入し、RETURNING で返った行（実際に挿入した行）を数える
   */
  public async insertIgnoringDuplicates(inputs: CreatePassageInput[]): Promise<number> {
    if (inputs.length === 0) return 0
    const rows = await this._db
      .insert(passages)
      .values(inputs)
      .onConflictDoNothing({ target: passages.contentHash })
      .returning({ id: passages.id })
    return rows.length
  }
}
