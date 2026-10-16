import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import tailwindcss from "eslint-plugin-tailwindcss"

import eslintConfigCommonRules from "@repo/eslint-config/common-rules"
import frontendBoundary from "@repo/eslint-config/frontend-boundary"
import testOnlyExports from "@repo/eslint-config/test-only-exports"

const { commonPlugins, commonRules } = eslintConfigCommonRules

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tailwindcss.configs["flat/recommended"],
  {
    /** Tailwind CSS プラグイン設定（全ファイル共通） */
    settings: {
      tailwindcss: {
        config: path.resolve(__dirname, "src/app/globals.css"),
        cssFiles: ["src/app/globals.css", "src/components/demo/*.css", "src/css/**/*.css"],
      },
    },
  },
  /** Override default ignores of eslint-config-next. */
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      ...commonPlugins,
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

      /** Tailwind CSS */
      "tailwindcss/classnames-order": "off",
    },
  },
  {
    /**
     * 土台はデモを import しない（デモの部品に寄りかからないように）。
     * デモの画面と部品自身は対象外。サイドバーのデモの項目（demo-nav-items.tsx）だけは土台の AppSidebar から読むので例外。
     * frontend-boundary の no-restricted-imports とは別のルールなので、設定が上書きし合わない
     */
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/app/(dashboard)/demo/**", "src/app/(auth)/demo/**", "src/components/demo/**"],
    rules: {
      "import/no-restricted-paths": ["error", {
        /**
         * zones のパスを eslint を起動した場所ではなく、この設定ファイルの場所から解決する（エディタの ESLint でも効くように）
         */
        basePath: __dirname,
        zones: [{
          except: ["./demo-nav-items.tsx"],
          from: "./src/components/demo",
          message: "土台からデモを import しない。デモの部品を使うなら props で動く形にして components/ui/ に移す",
          target: "./src",
        }],
      }],
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
])

export default eslintConfig
