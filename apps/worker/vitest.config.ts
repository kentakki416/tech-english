import { defineConfig } from "vitest/config"

/**
 * テストは DB / Redis を mock していて状態を共有しないので、並列実行（既定）のままにする
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts"],
  },
})
