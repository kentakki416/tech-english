# @repo/typescript-config

モノレポ全体で共通利用する **TypeScript の base 設定 (`tsconfig.json`)** を提供する。**全 apps / packages の `tsconfig.json` は `extends` で本パッケージを参照する**。

## 目次

- [役割](#役割)
- [主な設定（base.json）](#主な設定basejson)
- [使い方（新規 package / app 追加時）](#使い方新規-package--app-追加時)
- [`tsconfig.json` と `tsconfig.build.json` の使い分け](#tsconfigjson-と-tsconfigbuildjson-の使い分け)

## 役割

- 全 apps / packages で **同じ TS コンパイラ設定** を強制（`strict: true` / `target` / `module` 等）
- `outDir` / `include` / `exclude` も `${configDir}` で base に集約済み（TS 5.5+）。標準的な package は **`extends` 1 行**で済む

## 主な設定（base.json）

| key | 値 | 理由 |
| --- | --- | --- |
| `target` | `ES2020` | Node 18+ / モダンブラウザ対応 |
| `module` | `node16` | ESM / CJS interop を Node の解決ルールで処理 |
| `moduleResolution` | `node16` | `module` と揃える |
| `strict` | `true` | 全 app で strict mode 必須 |
| `esModuleInterop` | `true` | CJS パッケージの default import を許可 |
| `skipLibCheck` | `true` | 依存ライブラリの型エラーを無視（ビルド速度向上） |
| `declaration` / `declarationMap` / `sourceMap` | `true` | packages の型配布とデバッグに必須 |
| `forceConsistentCasingInFileNames` | `true` | OS 差異によるファイル名のケース差をエラー化 |
| `resolveJsonModule` | `true` | `import x from "./x.json"` を許可 |
| `outDir` | `${configDir}/dist` | 出力先。`${configDir}` は **継承先（leaf）のディレクトリ**に解決される（TS 5.5+ で利用可） |
| `include` / `exclude` | `${configDir}/src/**/*` 等 | コンパイル対象。同じく leaf 基準で解決 |

> **`rootDir` は base に置かない。** `src` + `test` を include する cron / worker で test が rootDir 外になり壊れるため。`src` のみ include の package では rootDir は自動推論されるので不要（出力は `dist/*.js`）。

## 使い方（新規 package / app 追加時）

標準的な package（`src` のみ・test 無し）は **extends 1 行**:

```jsonc
// packages/<new-pkg>/tsconfig.json
{
  "extends": "@repo/typescript-config/base.json"
}
```

`test` も型チェックしたい app（cron / worker 等）は **`include` だけ上書き**する（`outDir` / `exclude` は base から継承）:

```jsonc
// apps/<app>/tsconfig.json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": { "types": ["node", "vitest/globals"] },
  "include": ["${configDir}/src/**/*", "${configDir}/test/**/*"]
}
```

- Next.js / Expo の app（web / admin / mobile）は framework の preset を使い、base は extends しない。

## `tsconfig.json` と `tsconfig.build.json` の使い分け

dist を本番に出す server-side app（api / cron / worker）は **2 つの tsconfig を持つ**。役割が違う。

| ファイル | 用途 | include |
| --- | --- | --- |
| `tsconfig.json` | IDE / ESLint / 型チェック（`tsc --noEmit`） | `src` + `test` |
| `tsconfig.build.json` | 本番ビルド（`tsc -p tsconfig.build.json`） | `src` のみ（`test` は exclude） |

```jsonc
// tsconfig.build.json ── tsconfig.json を継承し、ビルド対象を src に絞る
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**なぜ分けるか:**

- `tsconfig.json` は **`test` も include** する → editor / ESLint がテストコードの型（vitest globals 等）を認識でき、型チェックもテスト込みで行える
- `tsconfig.build.json` は **`src` だけに絞る** → 理由は 2 つ:
  - **dist にテストコードを出力しない**（本番成果物を汚さない）
  - **`rootDir: "./src"` で出力構造を固定**。`src` と `test` を両方 include すると rootDir が共通祖先になり、出力が `dist/src/...` / `dist/test/...` とネストする。`src` のみにすれば `dist/*.js`（src 直下構造）に保てる

base のデフォルト include は `src` のみ。**cron / worker の `tsconfig.json` はこれを上書きして `test` を足し**、`tsconfig.build.json` で再び `src` のみに戻している。

> **分割が不要な側**: Next.js / Expo の app（web / admin / mobile）はビルドを framework に委ねるため不要。packages は test ディレクトリを持たず `tsconfig.json` が既に `src` のみ対象なので、分割しない。