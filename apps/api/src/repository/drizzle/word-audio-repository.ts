import { and, DrizzleClient, eq, inArray, wordAudios } from "@repo/db"

import type { WordAudioRepository } from "../word-audio-repository"

/**
 * Drizzle 実装の WordAudioRepository
 */
export class DrizzleWordAudioRepository implements WordAudioRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findReadyKeysByLemmas(lemmas: string[]): Promise<Map<string, string>> {
    if (lemmas.length === 0) return new Map()
    const rows = await this._db
      .select({ audioKey: wordAudios.audioKey, lemma: wordAudios.lemma })
      .from(wordAudios)
      .where(and(inArray(wordAudios.lemma, [...new Set(lemmas)]), eq(wordAudios.status, "ready")))
    return new Map(rows.flatMap((row) => (row.audioKey === null ? [] : [[row.lemma, row.audioKey] as const])))
  }
}
