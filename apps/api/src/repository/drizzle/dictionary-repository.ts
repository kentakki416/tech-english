import { dictionaryEntries, DrizzleClient, inArray } from "@repo/db"
import type { DictionaryEntry } from "@repo/domain"

import type { DictionaryRepository } from "../dictionary-repository"

type DictionaryEntryRow = typeof dictionaryEntries.$inferSelect

const convertDictionaryEntryRowToDomain = (row: DictionaryEntryRow): DictionaryEntry => ({
  id: row.id,
  headword: row.headword,
  meaningJa: row.meaningJa,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export class DrizzleDictionaryRepository implements DictionaryRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findByHeadwords(headwords: string[]): Promise<DictionaryEntry[]> {
    if (headwords.length === 0) return []
    const rows = await this._db.select().from(dictionaryEntries).where(inArray(dictionaryEntries.headword, headwords))
    return rows.map(convertDictionaryEntryRowToDomain)
  }
}
