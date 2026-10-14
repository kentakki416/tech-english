# @repo/eslint-config

モノレポ全体で共通利用する ESLint v9 (flat config) のルール群を提供する。**全 apps / packages の `eslint.config.js` は本パッケージを参照する**。

## 目次

- [役割](#役割)
- [formatting ルールは @stylistic](#formatting-ルールは-stylistic)
- [@repo/db の import 境界](#repodb-の-import-境界)
  - [このルールの限界](#このルールの限界)
- [フロントの @repo import 境界](#フロントの-repo-import-境界)
  - [client bundle への混入は lint だけでは防げない](#client-bundle-への混入は-lint-だけでは防げない)
- [使い方（新規 app 追加時）](#使い方新規-app-追加時)
- [関連](#関連)

## 役割

- 全 apps / packages で **同じ lint ルール** を強制（命名規則 / import 順 / クォート / セミコロン等）
- 共通 rule セット（`common-rules`）と完成済み flat config（`index.js`）を export し、apps 側は自身の framework (Next / Expo / Express) 用 config に merge する形で利用

## formatting ルールは @stylistic

ESLint 本体の formatting ルールは v8.53.0 で deprecated、v11.0.0 で削除されるため
[`@stylistic/eslint-plugin`](https://eslint.style) の同名ルールに置き換えている。

| 旧（本体） | 新 |
| --- | --- |
| `indent` | `@stylistic/indent` |
| `quotes` | `@stylistic/quotes` |
| `semi` | `@stylistic/semi` |
| `object-curly-spacing` | `@stylistic/object-curly-spacing` |
| `no-multiple-empty-lines` | `@stylistic/no-multiple-empty-lines` |
| `padded-blocks` | `@stylistic/padded-blocks` |
| `no-trailing-spaces` | `@stylistic/no-trailing-spaces` |
| `no-multi-spaces` | `@stylistic/no-multi-spaces` |
| `no-return-await` | `@typescript-eslint/return-await` |

オプションは本体と同じ値を渡している。例外は `@stylistic/indent` の `SwitchCase: 0`
（本体は 0 / @stylistic は 1 が既定）だけ。

本体の formatting ルールは TS 固有ノードを検査していなかったが、**@stylistic は
`type` / `interface` / `enum` の中身も検査する**。セミコロンなし・`{ foo }`・
2 スペースが型宣言にも効く。

`@stylistic` は `commonRules` を使う側で登録が必要なので、`commonPlugins` を
同じ config オブジェクトの `plugins` に展開する（→ [使い方](#使い方新規-app-追加時)）。

なお `react/jsx-indent` / `react/jsx-indent-props` / `react/jsx-tag-spacing` は
eslint-plugin-react 7.37.5 で deprecated ではないため `react/*` のまま使う。

## @repo/db の import 境界

`@repo/db` を依存に持つ server-side app（api / cron / worker）は、Drizzle のテーブル定義が業務ロジックへ漏れないように本フラグメントを spread する。

```js
// apps/worker/eslint.config.js
const baseConfig = require("@repo/eslint-config")
const dbBoundary = require("@repo/eslint-config/db-boundary")

module.exports = [...baseConfig, ...dbBoundary]
```

| 項目 | 内容 |
| --- | --- |
| 許可する export | client の factory / その options 型 / client 型のみ（`createDrizzleClient` / `CreateDrizzleClientOptions` / `DrizzleClient`） |
| 制限する export | 上記以外すべて。Drizzle のテーブル定義（`memos` / `users` …）と演算子（`eq` / `and` …）が対象。`import type` と `import * as` も検出する。テーブルが増えても設定変更は不要 |
| 許可する層 | `src/repository/**/*.ts` のみ。Repository 実装だけが「DB row → domain 型」の変換責務を持つ |
| 業務ロジックが使う型 | `@repo/domain`（`packages/domain`） |

### このルールの限界

**検出できるのは `@repo/db` からの直接 import だけ。** repository 層の `interface` が戻り値に Drizzle の型を使った場合、その型は推論で service / jobs へ伝播するが lint では検出できない（実際に `apps/worker` で起きた）。

```ts
/** ✗ lint は通るが Drizzle の行の型が jobs へ伝播する */
import { memos } from "@repo/db"            // repository/ 配下なので許可される

export interface MemoRepository {
  findById(id: number): Promise<typeof memos.$inferSelect | null>  // ← 戻り値経由で漏れる
}
```

「`interface` の引数・戻り値を domain 型にする」規約は各 app の `CLAUDE.md` とコードレビューで担保する。

## フロントの @repo import 境界

`apps/web` / `apps/admin` / `apps/mobile` が spread する。これらの app は DB を直接触らず必ず Express API を経由する設計なので、共有する契約は `@repo/api-schema` だけになる。

```js
// apps/mobile/eslint.config.js
const frontendBoundary = require("@repo/eslint-config/frontend-boundary")

module.exports = defineConfig([...(既存の config), ...frontendBoundary])
```

| 項目 | 内容 |
| --- | --- |
| 許可する package | `@repo/api-schema` **のみ** |
| 制限する package | 他の `@repo/*` すべて。パッケージが増えても設定変更は不要 |
| 意図的に許可しない | `@repo/domain`（domain 型は `createdAt: Date`、API は `created_at: string` なのでフロントは api-schema 側を使う）/ `@repo/errors`（service 層のパターン） |

### client bundle への混入は lint だけでは防げない

このルールが止められるのはフロントの**ソースに書かれた直接 import** まで。server 用モジュールが client component から参照される経路は lint では追えないので、`import "server-only"` を併用する。

```ts
// apps/admin/src/libs/api-client.ts
import "server-only"
```

client component から import されると Turbopack / webpack がビルドを落とし、import チェーンを表示する。**なお `server-only` は共有パッケージ側には入れられない**（`react-server` condition を持たない plain Node では無条件に throw するため、api / cron / worker が起動できなくなる）。各 app の server 用モジュール側に置く。

## 使い方（新規 app 追加時）

`commonRules` は flat config エントリではなく **rules オブジェクト** なので、framework の config を先に並べ、`rules` の中に展開して使う。

```js
// apps/web/eslint.config.mjs（Next.js の例）
import nextVitals from "eslint-config-next/core-web-vitals"

import eslintConfigCommonRules from "@repo/eslint-config/common-rules"

const { commonPlugins, commonRules } = eslintConfigCommonRules

export default [
  ...nextVitals,                       // framework の config を先に置く
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      ...commonPlugins,                // commonRules が参照する plugin を登録
    },
    rules: {
      ...commonRules,                  // 共通ルールを展開
      "react/jsx-indent": ["error", 2], // app 固有のルールを上書き / 追加
    },
  },
]
```

> **注意**: `eslint-config-next` / `eslint-config-expo` を使う app は **`@typescript-eslint` プラグインを再定義してはいけない**（"Cannot redefine plugin" エラー）。`common-rules` は再定義を避けた形になっている。`@stylistic` はどちらの framework config も登録しないので `commonPlugins` の展開で衝突しない。

## 関連

- ルートの [CLAUDE.md](../../CLAUDE.md) — Code Style 全体の正本
- 各 app の `eslint.config.js` — このパッケージの使用例
