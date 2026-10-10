import "server-only"

import { z } from "zod"

/**
 * apps/admin の server-side 環境変数スキーマ
 *
 * Server Component / Route Handler など server で動く箇所から参照する。
 * `server-only` で client component からの import を防ぐ。
 *
 * import 時点で safeParse が走り、不正な env の場合は process.exit(1) で停止する。
 * 各 app は src/env.ts に Zod スキーマと検証ロジックをインラインで定義する方針。
 */
const adminEnvSchema = z.object({
  /**
   * Express API の origin（Server Component / Route Handler から API を叩く際に使用）
   */
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
