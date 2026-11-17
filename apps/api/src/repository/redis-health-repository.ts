/**
 * 名前の「Redis」はヘルスチェックの対象を指し、実装に使う技術を指すものではない
 */
export interface RedisHealthRepository {
  ping(): Promise<void>
}
