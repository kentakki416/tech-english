import { defineConfig } from "vitest/config"

/**
 * packages/domain 用 Vitest 設定
 *
 * 定数・型・純粋関数だけのパッケージなので DB などの外部依存は無い。並列実行（デフォルト）で問題ない。
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
  },
})
