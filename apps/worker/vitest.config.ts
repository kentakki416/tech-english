import { defineConfig } from "vitest/config"

/**
 * Repository / job ハンドラの unit test は DB / Redis を mock するため DB / Redis 不要。
 * 並列実行（デフォルト）で問題ない。
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
  },
})
