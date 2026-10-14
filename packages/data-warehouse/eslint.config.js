const baseConfig = require("@repo/eslint-config")

/**
 * clickhouse/ の migration コマンドはライブラリの build（src/ → dist/）に含めないため、
 * 型情報は clickhouse/tsconfig.json から取る
 */
module.exports = [
  ...baseConfig,
  {
    files: ["clickhouse/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./clickhouse/tsconfig.json",
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./clickhouse/tsconfig.json",
        },
      },
    },
  },
]
