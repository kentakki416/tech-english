/**
 * 全プロジェクト共通の ESLint ルール定義
 *
 * apps / packages 双方の eslint.config.* から spread して使う:
 *
 *   const { commonPlugins, commonRules } = require("@repo/eslint-config/common-rules")
 *   plugins: { ...commonPlugins },
 *   rules: { ...commonRules, "app-specific-rule": "error" }
 *
 * naming-convention は配列全体で上書きされる仕様のため、selector を個別に
 * 上書きしたい場合 (mobile の variable に filter を足す等) は
 * `commonNamingConvention` を import してから map で書き換える。
 */

const stylistic = require("@stylistic/eslint-plugin")

/**
 * formatting 系ルールを提供する plugin。
 *
 * ESLint 本体の formatting ルール (indent / quotes / semi 等) は v8.53.0 で
 * deprecated、v11.0.0 で削除されるため `@stylistic/eslint-plugin` の同名ルールを
 * 使う。本体が検査していなかった TS 構文 (`type` / `interface` / `enum` の中身)
 * も検査されるので、セミコロンなし・`{ foo }`・2 スペースが型宣言にも効く。
 *
 * commonRules を spread する config は、同じ config オブジェクトに
 * `plugins: { ...commonPlugins }` も並べる必要がある
 * (plugin 未登録の namespace を rules で参照すると ESLint が起動時に落ちる)。
 * eslint-config-next / eslint-config-expo は `@stylistic` を登録しないので
 * `@typescript-eslint` のような "Cannot redefine plugin" は起きない。
 */
const commonPlugins = {
  "@stylistic": stylistic,
}

const commonNamingConvention = [
  {
    format: ["camelCase", "UPPER_CASE", "PascalCase"],
    selector: "variable",
  },
  {
    format: ["camelCase", "PascalCase"],
    selector: "function",
  },
  {
    format: ["PascalCase"],
    selector: "typeLike",
  },
  {
    format: ["camelCase"],
    leadingUnderscore: "require",
    modifiers: ["private"],
    selector: "memberLike",
  },
]

const commonRules = {
  /**
   * インデント
   *
   * SwitchCase のデフォルトが本体は 0 / @stylistic は 1 なので明示する。
   */
  "@stylistic/indent": ["error", 2, { SwitchCase: 0 }],

  /** Console */
  "no-console": ["warn", { allow: ["warn", "error"] }],

  /** 未使用変数 */
  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      args: "after-used",
      argsIgnorePattern: "^_",
      ignoreRestSiblings: true,
      varsIgnorePattern: "^_",
    },
  ],

  /** コードスタイル */
  "@stylistic/object-curly-spacing": ["error", "always"],
  "@stylistic/quotes": ["error", "double"],
  "@stylistic/semi": ["error", "never"],
  "@stylistic/no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0, maxEOF: 0 }],
  "@stylistic/padded-blocks": ["error", "never"],
  "@stylistic/no-trailing-spaces": "error",
  "@stylistic/no-multi-spaces": "error",

  /** Import 順序 */
  "import/order": [
    "error",
    {
      alphabetize: {
        caseInsensitive: true,
        order: "asc",
      },
      groups: [
        "builtin",
        "external",
        "internal",
        "parent",
        "sibling",
        "index",
      ],
      "newlines-between": "always",
      pathGroups: [
        {
          group: "internal",
          pattern: "@repo/**",
          position: "before",
        },
      ],
      pathGroupsExcludedImportTypes: ["builtin"],
    },
  ],
  "import/no-duplicates": ["error", { "prefer-inline": true }],

  /** TypeScript: 型安全性 */
  "@typescript-eslint/no-empty-function": "error",
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unnecessary-type-assertion": "error",
  "@typescript-eslint/promise-function-async": "warn",

  /**
   * TypeScript: return await の一貫性
   *
   * ESLint 本体の `no-return-await` は v8.46.0 で deprecated（`replacedBy` は空）。
   * 「`return await` は無駄」という前提がエンジン最適化で崩れたのが理由で、
   * 「try / catch の外では await を外す・中では付ける」という判定自体は今も有効なため、
   * 型情報を使って Promise だけを対象にする後継ルールへ置き換えた。
   * デフォルトの `in-try-catch` が本体の挙動（try 内は報告しない）と同じ判定を含む。
   */
  "@typescript-eslint/return-await": "error",

  /** TypeScript: クラスメンバーのアクセス修飾子を明示（constructor は除外） */
  "@typescript-eslint/explicit-member-accessibility": [
    "error",
    {
      accessibility: "explicit",
      overrides: {
        constructors: "off",
      },
    },
  ],

  /** TypeScript: 命名規則（private メンバーには _ プレフィックス必須） */
  "@typescript-eslint/naming-convention": ["error", ...commonNamingConvention],

  /** コード品質 */
  eqeqeq: ["error", "always"],
  "no-unneeded-ternary": "error",
  "no-var": "error",
  "prefer-arrow-callback": "error",
  "prefer-const": "error",
  "prefer-template": "error",
}

module.exports = {
  commonNamingConvention,
  commonPlugins,
  commonRules,
}
