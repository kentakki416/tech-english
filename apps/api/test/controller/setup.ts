import { createDrizzleClient, createPrismaClient, sql } from "@repo/db"
import { createRedisClient } from "@repo/redis"

/**
 * DB_NAME / REDIS_URL / JWT 系の環境変数は test/vitest.setup.ts で
 * setupFiles 経由で先に設定されているため、ここで再設定する必要はない。
 * createDrizzleClient / createPrismaClient / createRedisClient は process.env を読むので、
 * setupFiles で設定済みの値を拾ってテスト用 DB / Redis DB 1 に接続する。
 *
 * testDb（Drizzle）は本番と同じ実装で、テストデータの投入・確認にも使う。
 * testPrisma は併存している Prisma 実装の repository テストだけで使う。
 */
const db = createDrizzleClient()
const prisma = createPrismaClient()
const redis = createRedisClient()

export { db as testDb }
export { prisma as testPrisma }
export { redis as testRedis }

/**
 * テスト用 DB の public スキーマ配下に存在するテーブル名一覧。
 * PostgreSQL の system catalog から取得する。Drizzle の管理テーブルは drizzle スキーマにあるので対象外になる。
 * `_prisma_migrations` は Prisma の管理テーブルなので除外する（Prisma で作った DB を使う場合に備える）。
 * テストプロセス全体で一度だけ取得し、以降はキャッシュを使い回す。
 */
let cachedTableNames: string[] | null = null

const fetchTableNames = async (): Promise<string[]> => {
  if (cachedTableNames) return cachedTableNames
  const result = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `)
  cachedTableNames = result.rows.map((row) => row.tablename)
  return cachedTableNames
}

/**
 * テスト間でデータをクリーンアップする（全テーブルを TRUNCATE CASCADE する）
 * PostgreSQL の TRUNCATE ... CASCADE で FK 制約を含めて一括削除する
 * 各テストは beforeEach で呼び出し、必要なデータは自分で seed する方針
 */
export const cleanupTestData = async (): Promise<void> => {
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
  await Promise.all([db.$disconnect(), prisma.$disconnect()])
}

/**
 * テスト終了時にRedis接続を切断する
 */
export const disconnectTestRedis = async (): Promise<void> => {
  await redis.quit()
}
