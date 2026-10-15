import "server-only"

import { z } from "zod"

/**
 * apps/admin の server-side 環境変数スキーマ
 *
 * import 時点で safeParse が走り、不正な env の場合は process.exit(1) で停止する。
 */
const adminEnvSchema = z.object({
  /**
   * api の /api/admin/* に X-Admin-Token として付ける。api の ADMIN_API_TOKEN と同じ値。
   * api client（server-only）の外に出さない
   */
  ADMIN_API_TOKEN: z.string().min(32),

  /**
   * 画面全体を守る Basic 認証の資格情報（src/proxy.ts で検査する）。
   * proxy は server-only のこのモジュールを import できないため process.env を直接読む。ここでは必須の検査だけを行う
   */
  ADMIN_BASIC_AUTH_PASSWORD: z.string().min(12),

  ADMIN_BASIC_AUTH_USER: z.string().min(1),

  API_URL: z.string().url().default("http://localhost:8080"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
})

const result = adminEnvSchema.safeParse(process.env)
if (!result.success) {
  console.error("❌ Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data

export type AdminEnv = typeof env
