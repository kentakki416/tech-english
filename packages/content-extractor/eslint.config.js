const baseConfig = require("@repo/eslint-config")

module.exports = [
  ...baseConfig,
  {
    ignores: ["dist/**", "vitest.config.ts"],
  },
]
