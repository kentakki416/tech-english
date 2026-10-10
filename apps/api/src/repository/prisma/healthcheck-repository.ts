import { PrismaClient } from "@repo/db"

import type { DatabaseHealthRepository } from "../database-health-repository"

/**
 * Prisma実装のデータベースヘルスチェックリポジトリ
 */
export class PrismaDatabaseHealthRepository implements DatabaseHealthRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async ping(): Promise<void> {
    await this._prisma.$queryRaw`SELECT 1`
  }
}
