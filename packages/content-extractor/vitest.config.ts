import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    /**
     * テスト中のログを止める。WebPageClient の warn などがテストの出力に混ざり、アサーションの失敗が埋もれるため
     */
    env: {
      LOGGER_TYPE: "silent",
    },
    globals: true,
    include: ["test/**/*.test.ts"],
  },
})
