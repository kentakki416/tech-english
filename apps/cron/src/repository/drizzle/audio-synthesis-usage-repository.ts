import { audioSynthesisUsages, DrizzleClient, gte, sql } from "@repo/db"

import type { AudioSynthesisUsageRepository } from "../audio-synthesis-usage-repository"

/**
 * Drizzle 実装の AudioSynthesisUsageRepository
 */
export class DrizzleAudioSynthesisUsageRepository implements AudioSynthesisUsageRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async record(input: { characters: number; now: Date; passageId: number }): Promise<void> {
    await this._db
      .insert(audioSynthesisUsages)
      .values({ characters: input.characters, createdAt: input.now, passageId: input.passageId, updatedAt: input.now })
  }

  /**
   * 直前に書いた記録を数え落とさないよう primary から読む（read replica の遅れで上限を超えないため）。
   * SUM は bigint を文字列で返すので数値にする
   */
  public async sumCharactersSinceFromPrimary(since: Date): Promise<number> {
    const [row] = await this._db.$primary
      .select({ total: sql<string>`COALESCE(SUM(${audioSynthesisUsages.characters}), 0)` })
      .from(audioSynthesisUsages)
      .where(gte(audioSynthesisUsages.createdAt, since))
    return Number(row?.total ?? 0)
  }
}
