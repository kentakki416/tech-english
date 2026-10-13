import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import type { DictionaryEntry } from "@repo/domain"

import type { DictionaryRepository } from "../dictionary-repository"

/**
 * Prismaの型
 */
type DictionaryEntryRow = PrismaTypes.DictionaryEntryGetPayload<{}>

/**
 * Prismaの型 → ドメインの型
 */
const convertDictionaryEntryRowToDomain = (row: DictionaryEntryRow): DictionaryEntry => ({
  id: row.id,
  headword: row.headword,
  meaningJa: row.meaningJa,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Prisma 実装の DictionaryRepository
 */
export class PrismaDictionaryRepository implements DictionaryRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findByHeadwords(headwords: string[]): Promise<DictionaryEntry[]> {
    if (headwords.length === 0) return []
    const rows = await this._prisma.dictionaryEntry.findMany({ where: { headword: { in: headwords } } })
    return rows.map(convertDictionaryEntryRowToDomain)
  }
}
