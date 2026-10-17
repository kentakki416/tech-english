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

  /**
   * Google OAuth のクライアント ID。api の GOOGLE_CLIENT_ID と同じクライアントにする
   * （サインイン画面が始めた認可の code を、api がそのクライアントの GOOGLE_CLIENT_SECRET でトークンに換えるため）
   */
  GOOGLE_CLIENT_ID: z.string().default("dummy"),

  /**
   * admin 自身の URL（OAuth の redirect_uri と、サインイン後の戻り先の検査に使う）。
   * 末尾の / やパスが付いていてもよい（使う側は libs/app-origin.ts の APP_ORIGIN で origin にそろえる）
   */
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//.test(value), { message: "http:// か https:// で始める" }),

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
