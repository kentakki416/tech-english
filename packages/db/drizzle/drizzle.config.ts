import { defineConfig } from "drizzle-kit"

import { buildConnectionString } from "../src/connection-string"

/**
 * drizzle-kit（generate / migrate / push / studio）の設定
 *
 * パスは packages/db から見た相対パス（package.json の scripts は packages/db で実行される）。
 * DB_NAME=tech-english_test を指定するとテスト用 DB にマイグレーションを適用できる。
 */
export default defineConfig({
  dbCredentials: {
    url: buildConnectionString(),
  },
  dialect: "postgresql",
  out: "./drizzle/migrations",
  schema: "./src/drizzle/schema/index.ts",
})
