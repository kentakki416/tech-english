import { Prisma, PrismaClient } from "@repo/db"

import type { TransactionContext, TransactionRunner } from "../transaction"

/**
 * 不透明な TransactionContext を Prisma のトランザクションクライアントへ解決する。
 *
 * **Prisma 実装の内側だけで使う。** TransactionContext は brand 型で構造を持たないため、
 * 実体（Prisma のトランザクションクライアント）へ戻すにはここを通す必要がある。
 * この関数が「Prisma 型が外へ出ない」境界の出入口になっている。
 *
 * `tx` が未指定のときは通常の PrismaClient を返すので、Repository 側は
 * トランザクション内外を同じコードで扱える。
 */
export const resolvePrismaClient = (
  prisma: PrismaClient,
  tx?: TransactionContext,
): Prisma.TransactionClient =>
  (tx as unknown as Prisma.TransactionClient | undefined) ?? prisma

/**
 * Prisma 実装。`prisma.$transaction` をそのままラップする。
 */
export class PrismaTransactionRunner implements TransactionRunner {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this._prisma.$transaction(async (tx) =>
      fn(tx as unknown as TransactionContext))
  }
}
