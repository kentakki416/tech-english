/**
 * テストからだけ使う export（`forTesting`）を、テスト以外のコードから使わせない flat config フラグメント
 *
 * テストのためだけに export する関数・定数は、ファイル末尾の `export const forTesting = { ... }` にまとめる
 * （規約はルートの CLAUDE.md）。このフラグメントはテスト以外のファイルでの `forTesting` の import /
 * re-export / プロパティ参照を error にする。
 *
 * 既存の no-restricted-syntax / no-restricted-imports は app ごとの設定（mobile の env 参照、
 * db-boundary、frontend-boundary）で上書きし合うため、専用のルールにしている。
 *
 * **限界**: `export * from "./x"` で `forTesting` を持つファイルを re-export しても検出できない。
 * その場合は index.ts で名前を列挙して re-export する（規約に記載）。
 */

const FOR_TESTING_NAME = "forTesting"

const TEST_FILE_PATTERNS = [
  "**/test/**",
  "**/tests/**",
  "**/__tests__/**",
  "**/e2e/**",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
]

const getName = (node) => (node.type === "Identifier" ? node.name : node.value)

const noForTestingImport = {
  create: (context) => {
    const report = (node) => context.report({ messageId: "restricted", node })
    return {
      "ExportNamedDeclaration[source] > ExportSpecifier": (node) => {
        if (getName(node.local) === FOR_TESTING_NAME) report(node)
      },
      ImportSpecifier: (node) => {
        if (getName(node.imported) === FOR_TESTING_NAME) report(node)
      },
      MemberExpression: (node) => {
        if (!node.computed && node.property.name === FOR_TESTING_NAME) report(node)
      },
    }
  },
  meta: {
    docs: {
      description: "テストからだけ使う export（forTesting）をテスト以外のコードから使わない",
    },
    messages: {
      restricted: "forTesting はテストからだけ使う export。テスト以外のコードから使わない",
    },
    schema: [],
    type: "problem",
  },
}

const testOnlyExportsPlugin = {
  rules: {
    "no-for-testing-import": noForTestingImport,
  },
}

module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: TEST_FILE_PATTERNS,
    plugins: {
      "test-only-exports": testOnlyExportsPlugin,
    },
    rules: {
      "test-only-exports/no-for-testing-import": "error",
    },
  },
]
