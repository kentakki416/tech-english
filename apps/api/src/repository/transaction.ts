declare const transactionContextBrand: unique symbol

/**
 * Service から見て中身の無い**不透明トークン**。構造を持たない brand 型にしているのは、
 * Drizzle のトランザクションを公開すると service / controller が永続化技術に
 * 型付けされてしまうため。実体を解決するのは Repository 実装だけ。
 */
export type TransactionContext = {
  readonly [transactionContextBrand]: true
}

/**
 * `run` の callback の中で Repository に `tx` を渡した書き込みは、すべて同じトランザクションで実行される
 */
export interface TransactionRunner {
  run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>
}
