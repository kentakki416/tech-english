import { and, DrizzleClient, eq, passageAudios, passages, sql } from "@repo/db"

import type { PassageAudioRepository, PassageAudioWithPassage } from "../passage-audio-repository"
import type { TransactionContext } from "../transaction"

import { convertPassageAudioRowToDomain } from "./passage-audio-row"
import { resolveDrizzleClient } from "./transaction-runner"

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
   * 状態の条件付きの UPDATE なので、同時に状態が変わっていれば 0 行で false になる。updated_at を明示しないと $onUpdate が今の時刻を入れ、
   * 公開し直しの判定（updated_at < published_at）が崩れるので、今の値のままにする
   */
  public async requestRegeneration(passageId: number, now: Date): Promise<boolean> {
    const rows = await this._db
      .update(passageAudios)
      .set({ attemptCount: 0, lastError: null, regenerateRequestedAt: now, updatedAt: sql`${passageAudios.updatedAt}` })
      .where(and(eq(passageAudios.passageId, passageId), eq(passageAudios.status, "ready")))
      .returning({ id: passageAudios.id })
    return rows.length > 0
  }

  /**
   * 状態の条件付きの UPDATE なので、同時に生成タスクや別の再試行が状態を変えていれば 0 行で false になる
   */
  public async resetFailed(passageId: number, tx?: TransactionContext): Promise<boolean> {
    const rows = await resolveDrizzleClient(this._db, tx)
      .update(passageAudios)
      .set({ attemptCount: 0, lastError: null, status: "pending" })
      .where(and(eq(passageAudios.passageId, passageId), eq(passageAudios.status, "failed")))
      .returning({ id: passageAudios.id })
    return rows.length > 0
  }
}
