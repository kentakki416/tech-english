/**
 * TransactionContext の実体を隠すための brand。
 * 値としては存在せず、型レベルでのみ使う。
 */
declare const transactionContextBrand: unique symbol

/**
 * Service から見て中身の無い**不透明トークン**。構造を持たない brand 型にしているのは、
 * `Prisma.TransactionClient` や Drizzle のトランザクションを公開すると service / controller が永続化技術に
 * 型付けされてしまうため。実体を解決するのは Repository 実装だけ。
 */
export type TransactionContext = {
  readonly [transactionContextBrand]: true
}

/**
 * 業務ロジック単位でトランザクション境界を制御する抽象。
 *
 * Service 層が複数の Repository をまたぐ操作を atomic に実行するために使う。
 * Repository は受け取った `tx` を使って書き込めば、`run` の callback 内すべてが同一 tx で実行される。
 */
export interface TransactionRunner {
  run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>
}
