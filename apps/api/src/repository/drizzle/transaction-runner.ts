import type { DrizzleClient, DrizzleTransaction } from "@repo/db"

import type { TransactionContext, TransactionRunner } from "../transaction"

/**
 * TransactionContext は構造を持たない brand 型なので、Drizzle のトランザクションへ戻すにはここを通す。
 * `tx` が無ければ DrizzleClient を返すので、Repository はトランザクションの内外を同じコードで扱える
 */
export const resolveDrizzleClient = (
  db: DrizzleClient,
  tx?: TransactionContext,
): DrizzleClient | DrizzleTransaction =>
  (tx as unknown as DrizzleTransaction | undefined) ?? db

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
