import { createDrizzleClient, type DrizzleClient, sql } from "@repo/db"
import { createRedisClient } from "@repo/redis"

const db = createDrizzleClient()
const redis = createRedisClient()

export { db as testDb }
export { redis as testRedis }

/**
 * テストファイルごとに一度だけ取得し、以降はキャッシュを使い回す（vitest はテストファイルごとにモジュールを読み直す）
 */
let cachedTableNames: string[] | null = null

/**
 * Drizzle の管理テーブルは drizzle スキーマにあるので、public スキーマだけを見れば対象から外れる
 */
const fetchTableNames = async (): Promise<string[]> => {
  if (cachedTableNames) return cachedTableNames
  const result = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  `)
  cachedTableNames = result.rows.map((row) => row.tablename)
  return cachedTableNames
}

/**
 * 接続先の DB 名が `_test` で終わらなければ throw する。
 * DB_NAME は test/vitest.setup.ts でテスト用に置き換えているが、接続先は DATABASE_URL の DB 名の部分を
 * 正規表現で書き換えて決まる（buildConnectionString）ため、TRUNCATE の前に実際の接続先で確かめる
 */
const assertConnectedToTestDatabase = async (client: DrizzleClient): Promise<void> => {
  const result = await client.execute<{ name: string }>(sql`SELECT current_database() AS name`)
  const name = result.rows[0]?.name
  if (!name?.endsWith("_test")) {
    throw new Error(`Refusing to truncate tables: connected database "${name}" is not a test database (name must end with "_test")`)
  }
}

/**
 * 接続先はテストファイルごとに一度だけ確かめる
 */
let isTestDatabaseVerified = false

export const cleanupTestData = async (): Promise<void> => {
  if (!isTestDatabaseVerified) {
    await assertConnectedToTestDatabase(db)
    isTestDatabaseVerified = true
  }
  const names = await fetchTableNames()
  if (names.length === 0) return
  const tables = names.map((name) => `"${name}"`).join(", ")
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} CASCADE`))
}

/**
 * FLUSHDB は接続中の DB 番号だけを消すので、開発用のデータには影響しない
 */
export const cleanupTestRedis = async (): Promise<void> => {
  await redis.flushdb()
}

export const disconnectTestDb = async (): Promise<void> => {
  await db.$disconnect()
}

export const disconnectTestRedis = async (): Promise<void> => {
  await redis.quit()
}

export const forTesting = { assertConnectedToTestDatabase }
