import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    /**
     * テスト中のログを止める。失敗ジョブのテストは 1 件ごとに
     * スタックトレースが数十行出て、アサーションの失敗が埋もれる。
     */
    env: {
      LOGGER_TYPE: "silent",
    },
    globals: true,
    include: ["test/**/*.test.ts"],
  },
})
