import type { Memo as PrismaMemo, PrismaClient } from "@repo/db"
import type { Memo } from "@repo/domain"

import type { MemoRepository } from "../memo-repository"

/**
 * Prisma 実装の MemoRepository
 */
export class PrismaMemoRepository implements MemoRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findById(id: number): Promise<Memo | null> {
    const memo = await this._prisma.memo.findUnique({ where: { id } })
    if (!memo) return null
    return this._toDomainMemo(memo)
  }

  /**
   * Prisma の型 → ドメインの型に変換
   */
  private _toDomainMemo(prismaMemo: PrismaMemo): Memo {
    return {
      id: prismaMemo.id,
      body: prismaMemo.body,
      title: prismaMemo.title,
      createdAt: prismaMemo.createdAt,
      updatedAt: prismaMemo.updatedAt,
    }
  }
}
