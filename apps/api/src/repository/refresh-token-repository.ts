/**
 * Refresh Token リポジトリのインターフェース
 * Refresh Token は jti（JWT ID）をキーに userId を保存する。
 * ローテーション時は旧 jti を delete、新 jti を save する。
 */
export interface RefreshTokenRepository {
  delete(jti: string): Promise<void>
  findUserId(jti: string): Promise<number | null>
  save(jti: string, userId: number, ttlSeconds: number): Promise<void>
}
