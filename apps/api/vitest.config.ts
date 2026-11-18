import { resolve } from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,

    environment: "node",

    include: ["test/**/*.test.ts"],

    /**
     * controller テストは実 DB を共有するので、テストファイルを直列に実行して競合を避ける
     */
    fileParallelism: false,

    testTimeout: 3000,

    coverage: {
      exclude: ["src/**/*.d.ts", "src/index.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
    },

    setupFiles: [resolve(__dirname, "test/vitest.setup.ts")],
  },
})
