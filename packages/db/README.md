# @repo/db

DB のスキーマ / マイグレーション / client factory を一元管理する共有パッケージ。**全 server-side app (api / cron / worker...) は本パッケージ越しに DB へアクセスする**。

ORM / マイグレーションツールは Drizzle（`drizzle-orm` / `drizzle-kit`）を使う。Drizzle を選んだ理由（Prisma から移った理由）と、マイグレーション・接続・`CHECK` 制約・リードレプリカの挙動は [`docs/tech-stack/drizzle.md`](../../docs/tech-stack/drizzle.md) にまとめている。

## 目次

- [ディレクトリ構成](#ディレクトリ構成)
- [コマンド](#コマンド)
- [マイグレーション](#マイグレーション)
  - [`db:generate` が生成するファイル](#dbgenerate-が生成するファイル)
  - [`online.sql` の役割](#onlinesql-の役割)
  - [ローカル DB の作り直し](#ローカル-db-の作り直し)
- [client の生成と DI](#client-の生成と-di)

## ディレクトリ構成

```
packages/db/
├── drizzle/
│   ├── drizzle.config.ts   # drizzle-kit の設定
│   ├── ejdict.ts           # EJDict-hand の行を dictionary_entries の行にする純関数（ejdict.test.ts は node:test）
│   ├── migrations/         # db:generate の出力。db:migrate で適用する
│   │   └── {name}/
│   │       ├── migration.sql  # 1 トランザクションで流す文
│   │       └── online.sql     # トランザクションの外で流す文（CREATE INDEX CONCURRENTLY。ある場合だけ）
│   ├── seed-dictionary.ts  # 英和辞書（EJDict-hand）の投入。本番でも流す
│   ├── seed-sample-passages.ts  # 開発用のサンプル問題の投入（production では実行できない）
│   └── seed.ts             # 開発用ユーザーの投入
├── migrate/                # db:generate / db:migrate の実体（drizzle-kit の前後の処理。テストは test/migrate/）
└── src/
    ├── connection-string.ts  # DATABASE_URL + DB_NAME から接続文字列を作る（client / drizzle-kit 共通）
    ├── drizzle/
    │   ├── client.ts         # createDrizzleClient
    │   └── schema/           # テーブル定義（1 テーブル 1 ファイル）
    └── index.ts
```

## コマンド

`packages/db` で実行する。`apps/api` からは `pnpm --filter api db:migrate` のように実行すると `.env.local` を読み込んでから委譲する。

| コマンド | 実体 | 用途 |
| --- | --- | --- |
| `db:generate` | `drizzle-kit generate` + 後処理 | スキーマの差分からマイグレーション SQL を作る（DB 接続は不要）。`CREATE INDEX CONCURRENTLY` は `online.sql` に移す |
| `db:migrate` | `migration.sql`（`drizzle-kit migrate`）と `online.sql` を、フォルダの順に適用 | 未適用のマイグレーションを適用する。ローカル / CI / 本番の migration イメージで共通 |
| `db:push` | `drizzle-kit push` | マイグレーションを作らずにスキーマを DB へ直接反映する（ローカルでの試行錯誤用） |
| `db:seed` | `tsx drizzle/seed.ts` | 開発用ユーザー（alice / bob）を投入する。何度流してもよい |
| `db:seed:dictionary` | `tsx drizzle/seed-dictionary.ts` | 英和辞書（EJDict-hand、コミット固定）を取得して `dictionary_entries` に upsert する（約 4.6 万件）。何度流してもよい。`NODE_ENV=production` でもスキップしない（本番は migration イメージを command override で one-shot 起動して流す。初回と辞書の版を上げるときだけ） |
| `db:seed:sample-passages` | `tsx drizzle/seed-sample-passages.ts` | 開発用のサンプル問題（ソース 1 件・公開 1 件・下書き 2 件。本文・設問・用語集・和訳は web のモックのもの）を投入する。admin の問題の確認・公開と reading-practice の画面をローカルで確かめる用。何度流してもよく、流すと問題の状態と内容が初期値に戻る（挑戦の記録は消さない）。`NODE_ENV=production` では実行できない |
| `db:studio` | `drizzle-kit studio` | Drizzle Studio を起動する。画面は `https://local.drizzle.studio` から読み込まれるが、DB への接続はローカルのまま |
| `test` | `tsx --test drizzle/ejdict.test.ts && vitest run` | seed の純関数のテスト（Node 標準の `node:test`）と、`migrate/` のテスト（vitest）。DB は不要 |

`DB_NAME=tech-english_test` を付けると、接続先の DB 名だけをテスト用に差し替えられる（client / drizzle-kit とも同じ規則）。

## マイグレーション

テーブルを変えるときは、スキーマを変えてマイグレーションを作り、適用する（[マイグレーションの挙動](../../docs/tech-stack/drizzle.md#マイグレーション)）。

1. `src/drizzle/schema/` のテーブル定義を変える
2. `pnpm --filter api db:generate --name=<変更の名前>` でマイグレーションを作る
3. `drizzle/migrations/<日時>_<名前>/` に次のファイルが生成される。生成された SQL を確認する
    - `migration.sql`
    - `online.sql`（`.concurrently()` を付けた index の差分があるときだけ）
    - `snapshot.json`
4. `pnpm --filter api db:migrate` でローカルの DB に適用する
5. スキーマとマイグレーションのフォルダを一緒にコミットする（dev / min / prd には deploy の migrate ジョブが適用する）

### `db:generate` が生成するファイル

| ファイル | 流し方 | 中身 |
| --- | --- | --- |
| `migration.sql` | 未適用分をまとめて 1 トランザクション（`online.sql` を持つフォルダがあれば、そこで区切る）。途中で失敗すると、そのトランザクションの分はロールバックされる | テーブル・カラム・制約の変更 |
| `online.sql`（ある場合だけ） | 同じフォルダの `migration.sql` の適用後に、トランザクションの外で 1 文ずつ | `CREATE INDEX CONCURRENTLY`（書き込みを止めずに index を作る） |
| `snapshot.json` | 流さない | その時点のスキーマ。drizzle-kit が次の差分を出すのに使う |

`db:migrate` は、フォルダの名前順に両方を流す。ローカル・テスト・CI・本番で同じコマンドを使う。`drizzle-kit migrate` を直接実行すると `online.sql` が飛ばされるので、必ず `db:migrate` を使う。

### `online.sql` の役割

通常の `CREATE INDEX` は、作成が終わるまで対象テーブルへの書き込みを止める。行数の多いテーブルでは、スキーマの index に `.concurrently()` を付けて、書き込みを止めない `CREATE INDEX CONCURRENTLY` で作る。

ただし `CREATE INDEX CONCURRENTLY` は、Postgres の制約でトランザクションの中では実行できない。Drizzle は `migration.sql` を 1 つのトランザクションで流すので、この文だけを `online.sql` に分け、同じフォルダの `migration.sql` の後にトランザクションの外で流す。

```ts
(table) => [index("auth_accounts_user_id_idx").on(table.userId).concurrently()]
```

### ローカル DB の作り直し

ローカルの dev / test DB を空から作り直す手順（中のデータは消える）。マイグレーションの適用履歴と DB の中身がずれて `db:migrate` が `relation "users" already exists` などで失敗するときに使う。

ClickHouse の CDC（replication slot）を作っているときは、dev DB をそのままでは `DROP DATABASE` できないので、先に CDC を外す（CDC は既定では作らない。[ローカルの CDC](../../docs/tech-stack/clickhouse/cdc.md#ローカルの-cdc)）。

```bash
# 1. ClickHouse の CDC を外す（Postgres 側の replication slot / publication も一緒に消える。CDC が無ければ何もしない）
docker exec tech-english-clickhouse clickhouse-client --query "DROP DATABASE IF EXISTS pg_cdc"

# 2. dev / test DB を作り直す（WITH (FORCE) は起動中の api などの接続を切ってから消す）
docker exec tech-english-postgres psql -U postgres \
  -c 'DROP DATABASE IF EXISTS "tech-english_dev" WITH (FORCE)' -c 'CREATE DATABASE "tech-english_dev"' \
  -c 'DROP DATABASE IF EXISTS "tech-english_test" WITH (FORCE)' -c 'CREATE DATABASE "tech-english_test"'

# 3. マイグレーションと seed を流す
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm --filter api db:seed:dictionary

# 4. CDC を使っていたときだけ張り直す（ClickHouse の migration は CDC を毎回作り直す）
DATA_WAREHOUSE_CDC=materialized_postgresql pnpm --filter @repo/data-warehouse dwh:migrate
```

test DB は `pnpm --filter api test` が実行のたびにマイグレーションを流すので、作り直した後は空のままでよい。

## client の生成と DI

- **factory だけを export し、singleton は持たない。** 接続は各 app の `src/index.ts`（cron は `src/task/*.ts`）で 1 回だけ生成し、Repository に DI する。
- テーブル定義（`memos` / `users` …）とクエリ演算子（`eq` / `and` …）も `@repo/db` から import する。使ってよいのは各 app の `src/repository/**` だけ（`@repo/eslint-config/db-boundary` が lint で強制）。
- `onError` に各 app の logger を渡す。

```ts
/** 利用側 (apps/*/src/index.ts): factory で 1 回だけ生成し Repository に DI する */
import { createDrizzleClient } from "@repo/db"

const db = createDrizzleClient({
  onError: (error) => {
    logger.error("db idle client error", error)
  },
})
const memoRepository = new DrizzleMemoRepository(db)

process.on("SIGTERM", async () => {
  await db.$disconnect()
})
```

```ts
/** Repository 実装 (apps/*/src/repository/drizzle/): 行の型はテーブル定義から導出する */
import { DrizzleClient, eq, memos } from "@repo/db"

type MemoRow = typeof memos.$inferSelect

const [row] = await this._db.select().from(memos).where(eq(memos.id, id))
```
