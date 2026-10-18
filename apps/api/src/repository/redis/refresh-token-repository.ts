import { z } from "zod"

import type { Redis } from "@repo/redis"

import type { RefreshTokenRepository, RotatedTokens } from "../refresh-token-repository"

const rotatedTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})

/**
 * ioredis 実装の Refresh Token リポジトリ
 *
 * キーは `{keyPrefix}:{jti}` と、ローテーションの猶予の `{keyPrefix}_rotated:{jti}`。
 * 一般ユーザーは既定の `refresh_token`、admin は `admin_refresh_token` で作り、同じ Redis の中で混ざらないようにする
 * （接頭辞は 2 つのキーの両方に掛ける。片方だけだと、猶予の記録が一般ユーザーと admin で同じ空間に入る）
 */
export class IoRedisRefreshTokenRepository implements RefreshTokenRepository {
  private _keyPrefix: string
  private _redis: Redis

  constructor(redis: Redis, keyPrefix = "refresh_token") {
    this._keyPrefix = keyPrefix
    this._redis = redis
  }

  private _keyOf(jti: string): string {
    return `${this._keyPrefix}:${jti}`
  }

  /**
   * ローテーション済みの旧 jti → 発行したペア。`{keyPrefix}:*` と混ざらないよう別の接頭辞にする
   */
  private _rotatedKeyOf(jti: string): string {
    return `${this._keyPrefix}_rotated:${jti}`
  }

  public async save(jti: string, userId: number, ttlSeconds: number): Promise<void> {
    await this._redis.set(this._keyOf(jti), String(userId), "EX", ttlSeconds)
  }

  public async findUserId(jti: string): Promise<number | null> {
    const raw = await this._redis.get(this._keyOf(jti))
    return raw === null ? null : Number(raw)
  }

  public async delete(jti: string): Promise<void> {
    await this._redis.del(this._keyOf(jti))
  }

  public async saveRotatedTokens(jti: string, tokens: RotatedTokens, ttlSeconds: number): Promise<void> {
    const value: RotatedTokens = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
    await this._redis.set(this._rotatedKeyOf(jti), JSON.stringify(value), "EX", ttlSeconds)
  }

  /**
   * 猶予を過ぎた（TTL で消えた）・形が合わない値は null
   */
  public async findRotatedTokens(jti: string): Promise<RotatedTokens | null> {
    const raw = await this._redis.get(this._rotatedKeyOf(jti))
    if (raw === null) return null
    const parsed = rotatedTokensSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  }
}
