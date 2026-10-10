import type { PrismaClient } from "@repo/db"

import type { MemoRepository } from "../memo-repository"

/**
 * Prisma 実装の MemoRepository
 */
export class PrismaMemoRepository implements MemoRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async deleteOlderThan(threshold: Date): Promise<number> {
    const result = await this._prisma.memo.deleteMany({
      where: {
        createdAt: { lt: threshold },
      },
    })
    return result.count
  }
}
