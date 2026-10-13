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
   * admin のサーバー側だけが持つ共有シークレット。/api/admin/* の X-Admin-Token ヘッダと比較する
   * （JWT の secret と同じく 32 文字以上。apps/admin の ADMIN_API_TOKEN と同じ値にする）
   */
  ADMIN_API_TOKEN: z.string().min(32),

  /**
   * Admin API のダミーモード（DB 不要で固定データを返す）
   */
  ADMIN_USE_DUMMY: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),

  /**
   * 読み上げの音声の URL の base（本番は CloudFront の URL。docs/spec/read-aloud/tasks/step8-infra-audio.md）。
   * 未設定なら、開発では http://localhost:${PORT}/media（mediaRouter）、production では null（音声 API は pending を返し、起動時に warn）。
   * infra より先に本番へ出しても起動が止まらないよう必須にしない。空文字は未設定と同じ。
   * mobile の実機で確かめるときは http://<PC の LAN の IP>:8080/media にする
   */
  AUDIO_PUBLIC_URL_BASE: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),

  /**
   * /media の配信元（apps/api からの相対。cron の AUDIO_STORAGE_LOCAL_DIR と同じリポジトリ直下の .storage/audio/）。production では使わない
   */
  AUDIO_STORAGE_LOCAL_DIR: z.string().min(1).default("../../.storage/audio"),

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
   * GET /api/admin/content-source/license で GitHub のライセンス検出 API を呼ぶときの token。
   * 任意（未設定でも認証無しの 60 req/h の範囲で動く）。公開リポジトリを読むだけなので権限は不要
   */
  GITHUB_LICENSE_TOKEN: z.string().optional(),

  /**
   * GitHub OAuth App の Client ID / Client Secret（POST /api/auth/github で code を token に交換する）
   * dev 環境では "dummy" でも起動できる（GitHub ログインだけが失敗する）ため optional 扱い
   */
  GITHUB_OAUTH_CLIENT_ID: z.string().default("dummy"),

  GITHUB_OAUTH_CLIENT_SECRET: z.string().default("dummy"),

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
