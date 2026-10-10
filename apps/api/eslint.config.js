const { defineConfig } = require("eslint/config")
const typescriptEslint = require("@typescript-eslint/eslint-plugin")
const typescriptParser = require("@typescript-eslint/parser")
const importPlugin = require("eslint-plugin-import")
const vitestPlugin = require("@vitest/eslint-plugin")

const { commonPlugins, commonRules } = require("@repo/eslint-config/common-rules")
const dbBoundary = require("@repo/eslint-config/db-boundary")
const testOnlyExports = require("@repo/eslint-config/test-only-exports")

module.exports = defineConfig([
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        project: "./tsconfig.json",
        sourceType: "module",
      },
    },
    plugins: {
      ...commonPlugins,
      "@typescript-eslint": typescriptEslint,
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
    rules: {
      ...commonRules,
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "src/prisma/generated/**"],
  },
  /**
   * @repo/db（Prisma / Drizzle）の import 境界。詳細と限界は
   * packages/eslint-config/db-boundary.js を参照。
   */
  ...dbBoundary,
  /**
   * テストからだけ使う export（forTesting）をテスト以外から使わせない。
   * 詳細は packages/eslint-config/test-only-exports.js を参照。
   */
  ...testOnlyExports,
  {
    files: ["test/**/*.ts"],
    plugins: {
      vitest: vitestPlugin,
    },
    rules: {
      "vitest/expect-expect": "error",
      "vitest/no-disabled-tests": "warn",
      "vitest/no-focused-tests": "error",
      "vitest/valid-expect": "error",
    },
  },
])
