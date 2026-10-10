/**
 * Redis のヘルスチェック用リポジトリのインターフェース
 *
 * 「Redis」はヘルスチェックの対象サービス名であり実装技術の宣言ではない
 * （ioredis 実装は repository/redis/healthcheck-repository.ts 側）。
 */
export interface RedisHealthRepository {
  ping(): Promise<void>
}
