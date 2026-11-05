import { createDrizzleClient, sql } from "@repo/db"
import { createRedisClient } from "@repo/redis"

/**
 * DB_NAME / REDIS_URL / JWT 系の環境変数は test/vitest.setup.ts で
 * setupFiles 経由で先に設定されているため、ここで再設定する必要はない。
 * createDrizzleClient / createRedisClient は process.env を読むので、
 * setupFiles で設定済みの値を拾ってテスト用 DB / Redis DB 1 に接続する。
 *
 * testDb は本番と同じ実装で、テストデータの投入・確認にも使う。
 */
const db = createDrizzleClient()
const redis = createRedisClient()

export { db as testDb }
export { redis as testRedis }

/**
 * テスト用 DB の public スキーマ配下に存在するテーブル名一覧。
 * PostgreSQL の system catalog から取得する。Drizzle の管理テーブルは drizzle スキーマにあるので対象外になる。
 * テストプロセス全体で一度だけ取得し、以降はキャッシュを使い回す。
 */
let cachedTableNames: string[] | null = null

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
 * 接続先の DB 名が `_test` で終わらなければ throw する。確かめるのはテストプロセス全体で 1 回だけ。
 * DB_NAME は test/vitest.setup.ts でテスト用に置き換えているが、接続先は DATABASE_URL の DB 名の部分を
 * 正規表現で書き換えて決まる（buildConnectionString）ため、TRUNCATE の前に実際の接続先で確かめる
 */
let isTestDatabaseVerified = false

const assertTestDatabase = async (): Promise<void> => {
  if (isTestDatabaseVerified) return
  const result = await db.execute<{ name: string }>(sql`SELECT current_database() AS name`)
  const name = result.rows[0]?.name
  if (!name?.endsWith("_test")) {
    throw new Error(`Refusing to truncate tables: connected database "${name}" is not a test database (name must end with "_test")`)
  }
  isTestDatabaseVerified = true
}

/**
 * テスト間でデータをクリーンアップする（全テーブルを TRUNCATE CASCADE する）
 * PostgreSQL の TRUNCATE ... CASCADE で FK 制約を含めて一括削除する
 * 各テストは beforeEach で呼び出し、必要なデータは自分で seed する方針
 */
export const cleanupTestData = async (): Promise<void> => {
  await assertTestDatabase()
  const names = await fetchTableNames()
  if (names.length === 0) return
  const tables = names.map((name) => `"${name}"`).join(", ")
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} CASCADE`))
}

/**
 * テスト間でRedisデータをクリーンアップする
 * FLUSHDB はテスト用DB番号のみをクリアするため、開発用データに影響しない
 */
export const cleanupTestRedis = async (): Promise<void> => {
  await redis.flushdb()
}

/**
 * テスト終了時にDB接続を切断する
 */
export const disconnectTestDb = async (): Promise<void> => {
  await db.$disconnect()
}

/**
 * テスト終了時にRedis接続を切断する
 */
export const disconnectTestRedis = async (): Promise<void> => {
  await redis.quit()
}
