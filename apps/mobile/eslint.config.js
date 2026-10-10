/** https://docs.expo.dev/guides/using-eslint/ */
const { defineConfig } = require("eslint/config")
const expoConfig = require("eslint-config-expo/flat")
const tailwindcss = require("eslint-plugin-tailwindcss")

const { commonNamingConvention, commonPlugins, commonRules } = require("@repo/eslint-config/common-rules")
const frontendBoundary = require("@repo/eslint-config/frontend-boundary")
const testOnlyExports = require("@repo/eslint-config/test-only-exports")

/**
 * mobile では Expo Router の `unstable_*` 変数を許容するため、
 * 共通の naming-convention の `variable` selector に filter を追加する。
 */
const mobileNamingConvention = commonNamingConvention.map((entry) =>
  entry.selector === "variable"
    ? { ...entry, filter: { match: false, regex: "^unstable_" } }
    : entry,
)

const MOBILE_ENV_ACCESS_MESSAGE =
  "EXPO_PUBLIC_* は直接参照せず `import { env } from \"@/env\"` を経由する（src/env.ts の Zod 検証を通すため）"

module.exports = defineConfig([
  expoConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2020,
        project: "./tsconfig.json",
        sourceType: "module",
      },
    },
    plugins: {
      ...commonPlugins,
      tailwindcss: tailwindcss,
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

      /** TypeScript: 命名規則（mobile 固有: Expo Router の unstable_ を除外） */
      "@typescript-eslint/naming-convention": ["error", ...mobileNamingConvention],

      /** React: JSX インデント */
      "react/jsx-indent": ["error", 2],
      "react/jsx-indent-props": ["error", 2],

      /** React: JSX タグのスペース */
      "react/jsx-tag-spacing": ["error", {
        "afterOpening": "never",
        "beforeClosing": "never",
        "beforeSelfClosing": "always",
        "closingSlash": "never",
      }],

      /** Tailwind CSS (NativeWind) */
      "tailwindcss/classnames-order": "error",
      "tailwindcss/no-custom-classname": "error",
    },
  },
  /**
   * フロントが import してよい @repo パッケージの制限。
   * 詳細は packages/eslint-config/frontend-boundary.js を参照。
   */
  ...frontendBoundary,
  /**
   * テストからだけ使う export（forTesting）をテスト以外から使わせない。
   * 詳細は packages/eslint-config/test-only-exports.js を参照。
   */
  ...testOnlyExports,
  /**
   * `EXPO_PUBLIC_*` の参照は src/env.ts に閉じる。
   *
   * babel-preset-expo は `process.env.EXPO_PUBLIC_*` をビルド時にバンドルへ
   * 展開するため、直参照が散ると「どの env に依存しているか」が追えなくなり
   * 未設定でも起動してしまう。src/env.ts の Zod 検証を必ず通すよう強制する。
   * `process.env.EXPO_OS` は Expo が platform 名に置換するビルド時定数
   * （開発者が設定する env ではない）ため対象外。
   */
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["src/env.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          message: MOBILE_ENV_ACCESS_MESSAGE,
          selector:
            "MemberExpression[object.object.name=\"process\"][object.property.name=\"env\"][property.name=/^EXPO_PUBLIC_/]",
        },
        {
          message: MOBILE_ENV_ACCESS_MESSAGE,
          selector:
            "MemberExpression[object.object.name=\"process\"][object.property.name=\"env\"][property.value=/^EXPO_PUBLIC_/]",
        },
      ],
    },
  },
  {
    ignores: ["dist/*"],
  },
])
