import type { DrizzleClient, DrizzleTransaction } from "@repo/db"

import type { TransactionContext, TransactionRunner } from "../transaction"

/**
 * 不透明な TransactionContext を Drizzle のトランザクションへ解決する。
 *
 * **Drizzle 実装の内側だけで使う。** TransactionContext は brand 型で構造を持たないため、
 * 実体（Drizzle のトランザクション）へ戻すにはここを通す必要がある。
 * この関数が「Drizzle 型が外へ出ない」境界の出入口になっている。
 *
 * `tx` が未指定のときは通常の DrizzleClient を返すので、Repository 側は
 * トランザクション内外を同じコードで扱える。
 */
export const resolveDrizzleClient = (
  db: DrizzleClient,
  tx?: TransactionContext,
): DrizzleClient | DrizzleTransaction =>
  (tx as unknown as DrizzleTransaction | undefined) ?? db

/**
 * Drizzle 実装。`db.transaction` をそのままラップする。
 */
export class DrizzleTransactionRunner implements TransactionRunner {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this._db.transaction(async (tx) =>
      fn(tx as unknown as TransactionContext))
  }
}
