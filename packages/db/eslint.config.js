const baseConfig = require("@repo/eslint-config")

/**
 * packages/db は drizzle/ (CLI 用設定・マイグレーション・seed) を lint 対象外にする
 */
module.exports = [
  ...baseConfig,
  {
    ignores: ["drizzle/**"],
  },
]
