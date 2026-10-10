# @repo/db

DB のスキーマ / マイグレーション / client factory を一元管理する共有パッケージ。**全 server-side app (api / cron / worker...) は本パッケージ越しに DB へアクセスする**。

**Drizzle と Prisma を併存させている。** マイグレーションと各 app の DI は Drizzle を使い、Prisma は repository 実装の切り替え先として残している。

## 目次

- [併存の方針](#併存の方針)
- [ディレクトリ構成](#ディレクトリ構成)
- [コマンド](#コマンド)
- [マイグレーション](#マイグレーション)
  - [CREATE INDEX CONCURRENTLY は書けない](#create-index-concurrently-は書けない)
  - [Prisma で作ったローカル DB の作り直し（一度だけ）](#prisma-で作ったローカル-db-の作り直し一度だけ)
- [client の生成と DI](#client-の生成と-di)
- [enum 的な列は const から CHECK 制約を作る](#enum-的な列は-const-から-check-制約を作る)
- [リードレプリカの仕様](#リードレプリカの仕様)
  - [自動振り分けルール](#自動振り分けルール)
  - [強整合性が必要な read（read-after-write）](#強整合性が必要な-readread-after-write)

## 併存の方針

| | Drizzle（使う側） | Prisma（残している側） |
| --- | --- | --- |
| スキーマ定義 | `src/drizzle/schema/*.ts`（**正本**） | `prisma/schema.prisma`（Drizzle に合わせて手で更新する） |
| マイグレーション | `drizzle/migrations/`（**適用するのはこちら**） | `prisma/migrations/`（履歴として残すだけ。適用しない） |
| client factory | `createDrizzleClient` | `createPrismaClient` |
| 各 app の repository 実装 | `src/repository/drizzle/`（DI で使う） | `src/repository/prisma/`（切り替え先） |

- **テーブルを変えるときは Drizzle のスキーマを変える。** `db:generate` でマイグレーションを作り、`db:migrate` で適用する。
- **Prisma 実装を残している間は `schema.prisma` も同じ形に合わせ、`prisma:generate` する。** 合わせ忘れると Prisma 実装が古い列を前提に動く。api では `test/repository/` の契約テストが両実装を同じ DB で検証するので、ずれはテストで気付ける。
- **Prisma 実装に戻すときは各 app の composition root だけを差し替える**（api: `src/index.ts` / cron: `src/task/*.ts` / worker: `src/index.ts`）。repository は interface 越しに DI しているので、service 以降は変更不要。マイグレーションは引き続き Drizzle で管理する。

## ディレクトリ構成

```
packages/db/
├── drizzle/
│   ├── drizzle.config.ts   # drizzle-kit の設定
│   ├── migrations/         # db:generate の出力。db:migrate で適用する
│   └── seed.ts             # 開発用ユーザーの投入
├── prisma/
│   ├── migrations/         # Prisma で管理していた頃の履歴（適用しない）
│   ├── prisma.config.ts
│   └── schema.prisma
└── src/
    ├── connection-string.ts  # DATABASE_URL + DB_NAME から接続文字列を作る（Prisma / Drizzle 共通）
    ├── drizzle/
    │   ├── client.ts         # createDrizzleClient
    │   └── schema/           # テーブル定義（1 テーブル 1 ファイル）
    ├── prisma/
    │   └── client.ts         # createPrismaClient
    └── index.ts
```

## コマンド

`packages/db` で実行する。`apps/api` からは `pnpm --filter api db:migrate` のように実行すると `.env.local` を読み込んでから委譲する。

| コマンド | 実体 | 用途 |
| --- | --- | --- |
| `db:generate` | `drizzle-kit generate` | スキーマの差分からマイグレーション SQL を作る（DB 接続は不要） |
| `db:migrate` | `drizzle-kit migrate` | 未適用のマイグレーションを適用する。ローカル / CI / 本番の migration イメージで共通 |
| `db:push` | `drizzle-kit push` | マイグレーションを作らずにスキーマを DB へ直接反映する（ローカルでの試行錯誤用） |
| `db:seed` | `tsx drizzle/seed.ts` | 開発用ユーザー（alice / bob）を投入する。何度流してもよい |
| `db:studio` | `drizzle-kit studio` | Drizzle Studio を起動する。画面は `https://local.drizzle.studio` から読み込まれるが、DB への接続はローカルのまま |
| `prisma:generate` | `prisma generate` | Prisma Client を `generated/` に生成する。turbo の `build` がこれに依存する |

`DB_NAME=project-template_test` を付けると、接続先の DB 名だけをテスト用に差し替えられる（client / drizzle-kit とも同じ規則）。

## マイグレーション

- `db:migrate` は**未適用のマイグレーションをまとめて 1 つのトランザクションで流す**。途中で失敗すると全部ロールバックされるので、直して再実行すればよい（Prisma の `migrate resolve` のような後始末は要らない）。
- 適用済みかどうかは**マイグレーション名**で判定する（`drizzle.__drizzle_migrations`）。別ブランチで先に作ったマイグレーションが後から merge されても、取りこぼさずに適用される。
- `db:generate` は列のリネームなど判断が要る差分で対話的に確認を求める。生成された SQL は必ず目で確認してからコミットする。

### CREATE INDEX CONCURRENTLY は書けない

全体が 1 つのトランザクションで流れるため、トランザクション内で実行できない `CREATE INDEX CONCURRENTLY` はマイグレーションに書けない（書くと `cannot run inside a transaction block` で失敗する）。

行数の多いテーブルに index を足すとき（通常の `CREATE INDEX` だと作成中の書き込みがブロックされる）は、マイグレーションとは別の手順にする。

1. 対象環境の DB で `CREATE INDEX CONCURRENTLY "<index 名>" ON ...` を手動で実行する
2. 同じ名前の index をスキーマに足して `db:generate` する
3. 生成された `CREATE INDEX` を `CREATE INDEX IF NOT EXISTS` に書き換える（手動で作った環境では何もせず、新しく作る DB では普通に作られる）

### Prisma で作ったローカル DB の作り直し（一度だけ）

Drizzle の初期マイグレーションはテーブルを作る SQL なので、Prisma で migration 済みの DB に流すと `relation "users" already exists` で失敗する。Drizzle に切り替える前から使っているローカルの dev / test DB は、一度だけ作り直す（中のデータは消える）。新しく `docker compose up -d` した環境では不要。

dev DB には ClickHouse の CDC（replication slot）が繋がっていて、そのままでは `DROP DATABASE` できないので、先に CDC を外して最後に張り直す。

```bash
# 1. ClickHouse の CDC を外す（Postgres 側の replication slot / publication も一緒に消える）
docker exec project-template-clickhouse clickhouse-client --query "DROP DATABASE IF EXISTS pg_cdc"

# 2. dev / test DB を作り直す（WITH (FORCE) は起動中の api などの接続を切ってから消す）
docker exec project-template-postgres psql -U postgres \
  -c 'DROP DATABASE IF EXISTS "project-template_dev" WITH (FORCE)' -c 'CREATE DATABASE "project-template_dev"' \
  -c 'DROP DATABASE IF EXISTS "project-template_test" WITH (FORCE)' -c 'CREATE DATABASE "project-template_test"'

# 3. マイグレーションと seed を流す
pnpm --filter api db:migrate
pnpm --filter api db:seed

# 4. CDC を張り直す
docker exec -i project-template-clickhouse clickhouse-client --multiquery < infra/clickhouse/init/02-postgres-cdc.sql
docker exec project-template-clickhouse bash /docker-entrypoint-initdb.d/03-postgres-cdc-views.sh
```

test DB は `pnpm --filter api test` が実行のたびにマイグレーションを流すので、作り直した後は空のままでよい。

> `drizzle-kit migrate` は DB が無いときに作らない（Prisma の `migrate deploy` は作っていた）。test DB（`project-template_test`）は `infra/postgres/init/` の初期化スクリプトが Postgres の初回起動時に作る。

## client の生成と DI

- **factory だけを export し、singleton は持たない。** 接続は各 app の `src/index.ts`（cron は `src/task/*.ts`）で 1 回だけ生成し、Repository に DI する。
- テーブル定義（`memos` / `users` …）とクエリ演算子（`eq` / `and` …）も `@repo/db` から import する。app に `drizzle-orm` を直接入れると、peer dependency の解決次第で別インスタンスになり、テーブル定義と演算子の型が噛み合わなくなるため。必要な演算子が増えたら `src/index.ts` の re-export に足す。
- テーブル定義・演算子・Prisma の型を使ってよいのは各 app の `src/repository/**` だけ（`@repo/eslint-config/db-boundary` が lint で強制）。
- pg の Pool はアイドル中の接続が切れると `error` を emit し、リスナが無いとプロセスが落ちる。`onError` に各 app の logger を渡す。
- **接続のセッションのタイムゾーンは UTC に固定している。** 日時の列は `timestamp`（タイムゾーン無し）で、Drizzle はこれを UTC として読み書きする。DB の default の `now()` はセッションのタイムゾーンで評価されるので、固定しないとローカル（docker-compose は `TZ=Asia/Tokyo`）では `created_at` が 9 時間ずれる。psql や Drizzle Studio など別の接続から `now()` を使って書き込むときも同じ理由でずれるので注意する。

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

Prisma の client は `createPrismaClient()` で同じように生成する。Prisma の型は `export type` でのみ re-export しているので、`@repo/db` から `new PrismaClient()` はできない（factory を迂回させないため）。

## enum 的な列は const から CHECK 制約を作る

会員種別のような値の集合は `@repo/domain` が唯一の定義元（`packages/domain/README.md`）。Drizzle のスキーマは TS なので、domain の定数から **列の型と DB の `CHECK` 制約の両方**を作る。値を書き写さない。Postgres の `enum` 型（`pgEnum`）は値の削除・リネームが難しいので使わない。

```ts
/** src/drizzle/schema/user.ts（@repo/db の dependencies に @repo/domain を足す） */
import { sql } from "drizzle-orm"
import { check, pgTable, text } from "drizzle-orm/pg-core"

import { MEMBERSHIP_TIERS } from "@repo/domain"

export const users = pgTable(
  "users",
  {
    /** select 結果の型は "bronze" | "silver" | "gold" になる */
    membershipTier: text("membership_tier", { enum: MEMBERSHIP_TIERS }).notNull(),
  },
  (table) => [
    check(
      "users_membership_tier_check",
      sql`${table.membershipTier} IN (${sql.join(MEMBERSHIP_TIERS.map((tier) => sql`${tier}`), sql`, `)})`,
    ),
  ],
)
```

`db:generate` は次の SQL を生成する。

```sql
CONSTRAINT "users_membership_tier_check" CHECK ("membership_tier" IN ('bronze', 'silver', 'gold'))
```

- **値を足したら `db:generate` する。** `CHECK` を差し替える SQL（`DROP CONSTRAINT ..., ADD CONSTRAINT ...`）が自動で生成される。差し替え時に既存の全行を検査するので、行数の多いテーブルでは実行時間に注意する
- 値を消すときは、その値を持つ行が残っているとマイグレーションが失敗する（不正な状態のまま進まない）
- DB が値を保証するので、Drizzle 実装の Repository では `isMembershipTier` による検証は不要。`schema.prisma` は TS の定数を参照できず `String` 列になるため、**Prisma 実装では引き続き `_toDomain()` で検証する**
- **domain に値を足すと API 契約も変わる。** 値の追加は API 契約の変更としてレビューする（`packages/domain/README.md`）

## リードレプリカの仕様

`replicaUrl`（または `DATABASE_REPLICA_URL`）を指定すると read / write を自動で振り分ける。**未指定なら replica は使わず、primary が read / write の両方を担う**。

### 自動振り分けルール

| 操作 | Drizzle（`withReplicas`） | Prisma（`@prisma/extension-read-replicas`） |
| --- | --- | --- |
| read → replica | `select` / `$count` / `with` / `query` | `findMany` / `findUnique` / `count` / `aggregate` など |
| write → primary | `insert` / `update` / `delete` / `execute` / `transaction` | `create` / `update` / `delete` / `$transaction` / `$executeRaw` |

### 強整合性が必要な read（read-after-write）

replica は primary からの **レプリケーション遅延** があるため、直前に primary へ書き込んだ内容が replica にまだ反映されていないことがある（＝書いた直後に read すると古い値が返りうる）。

「書き込み直後に必ず最新を読みたい」ケースでは、primary からの read を明示的に強制する。

```ts
/** Drizzle: replica を経由せず primary から read（最新が保証される） */
const [fresh] = await db.$primary.select().from(users).where(eq(users.id, id))

/** Prisma */
const fresh = await prisma.$primary().user.findUnique({ where: { id } })
```

**Repository 規約**: 強整合が必須のメソッドは名前の末尾に `FromPrimary` を付け、primary 経由であることを呼び出し側に明示する（例: `findByIdFromPrimary`）。
