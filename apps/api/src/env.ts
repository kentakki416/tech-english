import { z } from "zod"

/**
 * apps/api の環境変数スキーマ
 *
 * 起動時にこのモジュールが import された時点で safeParse が走り、
 * 不正な env の場合は stderr にエラーを出力して process.exit(1) で停止する。
 *
 * 各 app は src/env.ts に Zod スキーマと検証ロジックをインラインで定義する方針
 * （詳細は docs/spec/shared-packages/README.md「環境変数の管理」参照）。
 */
const apiEnvSchema = z.object({
  /**
   * Admin API のダミーモード（DB 不要で固定データを返す）
   */
  ADMIN_USE_DUMMY: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),

  /**
   * Postgres 接続文字列
   * 未指定時は packages/db 側でローカル開発用デフォルトにフォールバックする
   */
  DATABASE_URL: z.string().url().optional(),

  DATABASE_REPLICA_URL: z.string().url().optional(),

  /**
   * test 時に test DB へ切り替えるためのオーバーライド名
   */
  DB_NAME: z.string().optional(),

  /**
   * 行動イベントの送出先。queue は Queue に enqueue し、apps/worker が ClickHouse に書き込む。
   * none はイベントを捨てる（worker を動かさない環境で使う。minimal 構成で worker を作らない場合）。
   * 既定値の queue は prd / dev の現在の挙動。
   */
  EVENT_TRACKER_TYPE: z.enum(["none", "queue"]).default("queue"),

  /**
   * レスポンスを返す前にイベント送出の完了を待つか。
   * レスポンス後に実行環境が凍結される Lambda（minimal 構成）でだけ true にする。
   */
  FLUSH_EVENTS_BEFORE_RESPONSE: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),

  /**
   * フロントエンドの origin（OAuth callback redirect 等で使用）
   */
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  /**
   * Google OAuth クライアント ID
   * dev 環境では "dummy" でも動くため optional 扱い
   */
  GOOGLE_CLIENT_ID: z.string().default("dummy"),

  GOOGLE_CLIENT_SECRET: z.string().default("dummy"),

  /**
   * Access Token 有効期限（例: "15m" / "1h"）
   */
  JWT_ACCESS_EXPIRATION: z.string().default("15m"),

  JWT_ACCESS_SECRET: z.string().min(32),

  /**
   * Refresh Token 有効期限（例: "7d" / "30d"）
   */
  JWT_REFRESH_EXPIRATION: z.string().default("7d"),

  JWT_REFRESH_SECRET: z.string().min(32),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /**
   * Logger 実装の種別
   * pino / winston / console / silent
   */
  LOGGER_TYPE: z.enum(["pino", "winston", "console", "silent"]).default("pino"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().int().positive().default(8080),

  /**
   * Redis 接続 URL（未設定時は @repo/redis が localhost デフォルトを使う）
   */
  REDIS_URL: z.string().url().optional(),
})

const result = apiEnvSchema.safeParse(process.env)
if (!result.success) {
  console.error("❌ Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data

export type ApiEnv = typeof env
