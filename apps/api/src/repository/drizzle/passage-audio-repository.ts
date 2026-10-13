import { and, DrizzleClient, eq, passageAudios, passages } from "@repo/db"

import type { PassageAudioRepository, PassageAudioWithPassage } from "../passage-audio-repository"

import { convertPassageAudioRowToDomain } from "./passage-audio-row"

/**
 * Drizzle 実装の PassageAudioRepository
 */
export class DrizzlePassageAudioRepository implements PassageAudioRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findByPassageId(passageId: number): Promise<PassageAudioWithPassage | null> {
    const [row] = await this._db
      .select({ audio: passageAudios, passagePublishedAt: passages.publishedAt, passageStatus: passages.status })
      .from(passages)
      .leftJoin(passageAudios, eq(passageAudios.passageId, passages.id))
      .where(eq(passages.id, passageId))
    if (!row) return null
    return {
      audio: row.audio ? convertPassageAudioRowToDomain(row.audio) : null,
      passage: { publishedAt: row.passagePublishedAt, status: row.passageStatus },
    }
  }

  /**
   * 状態の条件付きの UPDATE なので、同時に生成タスクや別の再試行が状態を変えていれば 0 行で false になる
   */
  public async resetFailed(passageId: number): Promise<boolean> {
    const rows = await this._db
      .update(passageAudios)
      .set({ attemptCount: 0, lastError: null, status: "pending" })
      .where(and(eq(passageAudios.passageId, passageId), eq(passageAudios.status, "failed")))
      .returning({ id: passageAudios.id })
    return rows.length > 0
  }
}
