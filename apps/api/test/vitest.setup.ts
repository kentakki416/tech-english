/**
 * Vitest 共通セットアップ。テストモジュールの import より前に実行されるため、
 * 環境変数を参照する src/ 配下のモジュール（env.ts や test/controller/setup.ts で
 * 呼ぶ createPrismaClient / createRedisClient 等）が読み込まれる前に
 * 必要な値を確実に設定できる。
 *
 * 旧 Jest 構成では jest.config.js のトップレベルおよび test/controller/setup.ts の
 * 先頭で process.env を書き換えていたが、ESM 環境では import の hoist によって
 * その代入より先にモジュールが評価されるため、Vitest 側では setupFiles に集約する。
 */
process.env.LOGGER_TYPE = process.env.LOGGER_TYPE || "silent"

/**
 * JWT secret は src/env.ts の apiEnvSchema で min(32) 制約があるため、
 * テスト用デフォルトも 32 文字以上にする
 */
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-jwt-access-secret-at-least-32-chars"
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret-at-least-32-chars"
process.env.JWT_ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || "15m"
process.env.JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || "7d"

/**
 * ADMIN_API_TOKEN も apiEnvSchema で min(32) 制約があるため 32 文字以上にする
 */
process.env.ADMIN_API_TOKEN =
  process.env.ADMIN_API_TOKEN || "test-admin-api-token-at-least-32-chars"

/**
 * test:ci では dotenvx を通さないため DATABASE_URL が未設定。
 * packages/db 側は DEFAULT_URL にフォールバックするが、apiEnvSchema の
 * z.string().url() を満たすためにここでも明示的に補完しておく。
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5433/tech-english_test"

/**
 * Controller integration テストの接続先（テスト用 DB / Redis DB 1）。
 * 旧構成では test/controller/setup.ts の先頭で設定していたが、上記理由により
 * ここに移し、controller / service のどちらの実行でも同じ初期化が走るようにする。
 */
process.env.DB_NAME = process.env.DB_NAME || "tech-english_test"

/**
 * Redis は設定されていても DB の番号を 1 に置き換える（test/controller/setup.ts が flushdb する）。
 * `pnpm test` は dotenvx で .env.local の REDIS_URL（DB の番号なし＝開発用の DB 0）を入れるので、
 * 未設定のときだけ補う形だと、テストのたびに開発用の Redis（refresh token など）を空にしてしまう
 */
const testRedisUrl = new URL(process.env.REDIS_URL || "redis://localhost:6380")
testRedisUrl.pathname = "/1"
process.env.REDIS_URL = testRedisUrl.toString()
