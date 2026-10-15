import { z } from "zod"

import type { Redis } from "@repo/redis"

import type { RefreshTokenRepository, RotatedTokens } from "../refresh-token-repository"

const keyOf = (jti: string): string => `refresh_token:${jti}`

/**
 * ローテーション済みの旧 jti → 発行したペア。`refresh_token:*` と混ざらないよう別の prefix にする
 */
const rotatedKeyOf = (jti: string): string => `refresh_token_rotated:${jti}`

const rotatedTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})

export class IoRedisRefreshTokenRepository implements RefreshTokenRepository {
  private _redis: Redis

  constructor(redis: Redis) {
    this._redis = redis
  }

  public async save(jti: string, userId: number, ttlSeconds: number): Promise<void> {
    await this._redis.set(keyOf(jti), String(userId), "EX", ttlSeconds)
  }

  public async findUserId(jti: string): Promise<number | null> {
    const raw = await this._redis.get(keyOf(jti))
    return raw === null ? null : Number(raw)
  }

  public async delete(jti: string): Promise<void> {
    await this._redis.del(keyOf(jti))
  }

  public async saveRotatedTokens(jti: string, tokens: RotatedTokens, ttlSeconds: number): Promise<void> {
    const value: RotatedTokens = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
    await this._redis.set(rotatedKeyOf(jti), JSON.stringify(value), "EX", ttlSeconds)
  }

  /**
   * 猶予を過ぎた（TTL で消えた）・形が合わない値は null
   */
  public async findRotatedTokens(jti: string): Promise<RotatedTokens | null> {
    const raw = await this._redis.get(rotatedKeyOf(jti))
    if (raw === null) return null
    const parsed = rotatedTokensSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  }
}
