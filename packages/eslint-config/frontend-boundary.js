/**
 * フロント（Next.js / Expo）が import してよい `@repo/*` パッケージを制限する
 * flat config フラグメント
 *
 * apps/web / apps/admin / apps/mobile の eslint.config.* から spread して使う:
 *
 *   const frontendBoundary = require("@repo/eslint-config/frontend-boundary")
 *   module.exports = defineConfig([...(既存の config), ...frontendBoundary])
 *
 * 目的: server 専用パッケージが client bundle に混入するのを防ぐ。
 * これらの app は DB を直接触らず必ず Express API を経由する設計なので、
 * 共有すべき契約は `@repo/api-schema` だけになる。
 */

/**
 * フロントから import してよい `@repo/*` パッケージ。
 *
 * **禁止リストではなく許可リストにしている理由**: `packages/` に新しいパッケージを
 * 追加したときに、この設定を触らなくても自動的に制限対象になるようにするため
 * （fail-closed）。禁止リストだと追加を忘れた瞬間に保護が外れる。
 *
 * `@repo/domain` を含めていないのは意図的。domain 型は `createdAt: Date` だが
 * API のワイヤーフォーマットは `created_at: string` なので、API 境界の外側にいる
 * フロントが使うべき型は `@repo/api-schema` 側になる。
 * `@repo/errors` の `Result<T>` / `ApiError` も service 層のパターンで、フロントは使わない。
 */
const ALLOWED_REPO_PACKAGES = ["@repo/api-schema"]

const RESTRICTED_IMPORT_MESSAGE =
  "フロントは Express API 経由でデータを取得する。共有するのは @repo/api-schema の契約だけ。" +
  "server 専用パッケージ（db / logger / redis / queue / storage）は client bundle に混入するため import しない"

module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@repo/*", ...ALLOWED_REPO_PACKAGES.map((name) => `!${name}`)],
              message: RESTRICTED_IMPORT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
]
