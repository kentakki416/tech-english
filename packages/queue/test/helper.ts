import { createRedisClient, type Redis } from "@repo/redis"

/**
 * テスト用 Redis 接続。
 *
 * **実 Redis を使い、モックしない。** キー名・BullMQ の状態遷移・リトライの
 * 挙動は mock では検出できない（`apps/api/CLAUDE.md` のテスト方針）。
 *
 * BullMQ の Worker は `maxRetriesPerRequest: null` の接続が必須（BullMQ 5.x 要件）。
 */
export const createTestRedis = (): Redis =>
  createRedisClient({
    options: { maxRetriesPerRequest: null },
    url: process.env.REDIS_URL ?? "redis://localhost:6380",
  })

/**
 * テストで使った queue のキーだけを削除する。
 *
 * **FLUSHDB は絶対に使わない。** ローカルの Redis は他プロジェクトと共有されうるため、
 * 過去に別プロジェクトのデータを消す事故を起こしている。必ず prefix で絞る。
 */
export const cleanupQueueKeys = async (redis: Redis, queueName: string): Promise<void> => {
  const keys = await redis.keys(`bull:${queueName}:*`)
  if (keys.length > 0) await redis.del(...keys)
}

/**
 * 条件が満たされるまで待つ。BullMQ の状態遷移は非同期なので、
 * enqueue や失敗の直後にアサーションしても間に合わない。
 */
export const waitUntil = async (
  predicate: () => boolean | Promise<boolean>,
  { intervalMs = 25, timeoutMs = 5000 } = {},
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`waitUntil: ${timeoutMs}ms 以内に条件が満たされなかった`)
}
