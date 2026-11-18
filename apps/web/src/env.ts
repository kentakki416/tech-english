import "server-only"

import { z } from "zod"

const webEnvSchema = z.object({
  /**
   * Express API の origin
   */
  API_URL: z.string().url().default("http://localhost:8080"),

  /**
   * GitHub OAuth App の Client ID（認可 URL の構築に使用）。Client Secret は api だけが持つ
   */
  GITHUB_OAUTH_CLIENT_ID: z.string().default("dummy"),

  GOOGLE_CLIENT_ID: z.string().default("dummy"),

  /**
   * web 自身の origin（OAuth の redirect_uri を組み立てるのに使う）
   */
  NEXT_PUBLIC_APP_URL: z.string().url(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
})

const result = webEnvSchema.safeParse(process.env)
if (!result.success) {
  console.error("❌ Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data

export type WebEnv = typeof env
