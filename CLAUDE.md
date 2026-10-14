# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Turborepo + pnpm モノレポ。

### Apps

- **apps/web**: Next.js 16 web application (port 3000)
- **apps/admin**: Next.js 16 admin dashboard (port 3030)
- **apps/mobile**: Expo/React Native mobile application
- **apps/api**: Express.js API server (port 8080)
- **apps/cron**: 定期実行タスク（タスク 1 回実行で exit するモデル。本番は EventBridge / CronJob 等で起動）
- **apps/worker**: 常駐型 worker（BullMQ ベース）

### Packages

- **packages/schema**: Shared Zod schemas (`@repo/api-schema`)
- **packages/db**: DB スキーマ / マイグレーション / client factory (`@repo/db`)。ORM は Drizzle（`createDrizzleClient`）（`packages/db/README.md` 参照）
- **packages/logger**: `ILogger` + pino/winston/console/silent + AsyncLocalStorage context (`@repo/logger`)
- **packages/errors**: `Result<T>` + `ApiError` + 業務エラー生成ヘルパ (`@repo/errors`)
- **packages/redis**: `createRedisClient` factory（BullMQ / Pub/Sub 対応）(`@repo/redis`)
- **packages/queue**: Queue 抽象 (`JobQueue<T>` / `JobProcessor<T>` / `JobConsumer`) + BullMQ 実装 (`@repo/queue`)。ハンドラ側は実装を知らないため、SQS / Cloud Tasks 等への差し替えが可能
- **packages/domain**: api / cron / worker が共有するドメイン型 (`@repo/domain`)。型・定数・純粋関数のみ・依存ゼロ。**Repository interface と Drizzle の型は置かない**。enum 的な値の集合はここが SSOT で、api-schema は `z.enum` をここの定数から作り、DB は Drizzle のスキーマでここの定数から `CHECK` 制約を作る（`packages/domain/README.md` 参照）
- **packages/data-warehouse**: `DataWarehouse` 抽象 + ClickHouse 実装 + `createDataWarehouse` factory (`@repo/data-warehouse`)。分析イベントの書き込み先
- **packages/events**: 行動イベントの型定義 + `EventTracker` 抽象 + Queue 実装 (`@repo/events`)。送出は fire-and-forget で、失敗を呼び出し元に伝播させない
- **packages/storage**: `createStorage` factory + local / S3 実装 (`@repo/storage`)
- **packages/eslint-config** / **packages/typescript-config**: 共有 lint / tsconfig

**共通パッケージの方針**: `db` / `logger` / `errors` / `redis` / `storage` は server-side app 横断で使う共通基盤。client は **factory のみを export** し、各 app の `src/index.ts` で 1 回生成して Repository に DI する。新規 server-side app (cron / worker / batch) も同じ流儀に従う。

**env の検証は各 app の `src/env.ts` にインラインで定義する**（Zod スキーマ + `safeParse → process.exit(1)`）。共通の env 検証パッケージは持たず、`apps/{app}/src/env.ts` 単独で env 仕様が完結するようにする。`apps/web` / `apps/admin` は `server-only` でガードして client component からの import を防ぐ。`apps/mobile` は RN に server が無く `process.exit` も使えないため、`EXPO_PUBLIC_*` を静的に列挙して検証し、不正なら throw する（詳細は `apps/mobile/CLAUDE.md`）。

### Infra

- **infra/terraform**: AWS Infrastructure as Code

### 作業時に参照するドキュメント

各ディレクトリでの作業時は **対応する `CLAUDE.md` を参照してください**:

- API → `apps/api/CLAUDE.md`（レイヤードアーキテクチャ / Result型 / テスト戦略 / dotenvx / Admin方針 / DI assembly）
- Web → `apps/web/CLAUDE.md`
- Admin → `apps/admin/CLAUDE.md`
- Mobile → `apps/mobile/CLAUDE.md`
- Cron → `apps/cron/CLAUDE.md`（task / repository 構造 / env 検証 / graceful shutdown / Docker / 本番起動想定）
- Worker → `apps/worker/CLAUDE.md`（Queue 抽象 / BullMQ → 他実装への切り替え方 / 新 Queue の追加手順 / 冪等性）
- スキーマ → `packages/schema/CLAUDE.md`（スキーマ命名規則）
- Terraform → `infra/terraform/CLAUDE.md`

アーキテクチャ・規約のトピック別まとめは [`docs/onboarding/`](docs/onboarding/README.md)（人間向けキャッチアップ。正典は各 `CLAUDE.md`）。

## Common Commands (root)

```bash
pnpm dev          # 全アプリを dev 起動
pnpm build        # 全アプリをビルド
pnpm lint         # ESLint
pnpm lint:fix     # ESLint 自動修正
pnpm test         # テスト
```

各アプリ固有のコマンドは対応サブディレクトリの `CLAUDE.md` を参照。前提は Node.js >=18 / pnpm >=9（インフラ作業時は Terraform + AWS CLI）。

## Code Style

ESLint v9 flat config。**ファイル変更後は `pnpm lint:fix` を実行する。** ルールの実体は `packages/eslint-config/`。セミコロン / クォート / インデント / import 順 / 命名（case）/ クラスメンバーの修飾子と `_` プレフィックス / `@repo/db`（Drizzle）と `@repo/*` の import 境界は**すべて lint が強制する**ので、ここには列挙しない。

lint で強制できていない規約は以下。

- **関数名は動詞から始める**。boolean を返す判定関数は `is` / `should` / `can` / `has` で始める
  - 例外: 複数条件をまとめて検証するものは `check` / `verify` / `validate` 可（`checkOrderPreconditions`）
  - 例外: 処理を実行して成否を返すものは動作の動詞のまま（`tryRefresh`）
  - 抽象的すぎる名前を避ける（`parseAmount` ✗ → `convertCommaAmountToNumber` ✓）
- **オブジェクトのキーはアルファベット順**（2 個以上）。`id` は先頭、`createdAt` / `updatedAt` / `deletedAt` は末尾
- **バレルエクスポート（index.ts）はファイル名順**
- **React JSX props**: callbacks last, shorthand first, reserved first
- **Function style**: api / cron / worker は `const` + アロー関数、web / admin / mobile のコンポーネントは `function`
- **ブロックコメントは `/** */`**（`//` は使わない）。1 行の内容でも複数行形式で書く
- **web / admin で server 側の処理（API 呼び出し・env 参照）を書くモジュールは先頭に `import "server-only"` を置く**。client component から import されたらビルドが落ちるようにするため（lint では検出できない）
- **テストのためだけに export する関数・定数は、ファイル末尾の `export const forTesting = { ... }` にまとめる**。個別に `export` しない。テスト側は `const { xxx } = forTesting` で取り出す
  - `forTesting` を持つファイルを `index.ts` で `export *` しない（名前を列挙して re-export する）。`export *` だと公開 API に漏れ、同じ index で 2 つ以上あると TS2308 で衝突する
  - テスト以外から `forTesting` を使うと lint エラーになる（`packages/eslint-config/test-only-exports.js`）

lint 設定自体を触るときの注意:

- `eslint-config-next` / `eslint-config-expo` を使う app では `@typescript-eslint` を再定義しない（"Cannot redefine plugin"）
- `commonRules` を spread する config には `plugins: { ...commonPlugins }` も並べる（plugin 未登録の namespace を rules で参照すると ESLint が起動時に落ちる）
- import 境界の lint が防げるのは直接 import だけで、`interface` の戻り値経由の型伝播は防げない（`packages/eslint-config/README.md`）

## Documentation Guidelines

- 仕様書・設計書は `docs/spec/{feature}/` に置き、**実装前に必ず `design-feature` skill で作成する**（構成・テンプレート・step の書き方は同 skill が持つ）。デザインモックは `design-mock` skill
- ドキュメントは日本語で書く
- **図は Mermaid で書く**（フロー図 / シーケンス図 / ER 図 / 状態遷移図）。ASCII アートは使わない

## Important Notes

- スキーマパッケージは依存アプリより先にビルドする必要がある。スキーマ変更時は `cd packages/schema && pnpm build`
- Terraform state は S3 + S3 ネイティブロック（`use_lockfile = true`、Terraform 1.10+）構成（bootstrap で構成済み）
