/**
 * ローテーションで旧 refresh token の代わりに発行したペア
 */
export type RotatedTokens = {
  accessToken: string
  refreshToken: string
}

/**
 * Refresh Token リポジトリのインターフェース
 * Refresh Token は jti（JWT ID）をキーに userId を保存する。
 * ローテーション時は新 jti を save し、旧 jti → 発行したペアを短い猶予の間だけ saveRotatedTokens で残してから、旧 jti を delete する。
 */
export interface RefreshTokenRepository {
  delete(jti: string): Promise<void>
  findRotatedTokens(jti: string): Promise<RotatedTokens | null>
  findUserId(jti: string): Promise<number | null>
  save(jti: string, userId: number, ttlSeconds: number): Promise<void>
  saveRotatedTokens(jti: string, tokens: RotatedTokens, ttlSeconds: number): Promise<void>
}
