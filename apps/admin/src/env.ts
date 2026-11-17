import "server-only"

import { z } from "zod"

const adminEnvSchema = z.object({
  /**
   * Express API の origin
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
