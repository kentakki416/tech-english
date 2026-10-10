import type { Redis } from "@repo/redis"

import type { RefreshTokenRepository } from "../refresh-token-repository"

const keyOf = (jti: string): string => `refresh_token:${jti}`

/**
 * ioredis 実装の Refresh Token リポジトリ
 */
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
}
