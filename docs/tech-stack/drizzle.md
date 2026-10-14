# Drizzle

Postgres の ORM とマイグレーションツール（`drizzle-orm` / `drizzle-kit`）。スキーマを TypeScript で書き、
[`@repo/db`](../../packages/db/README.md) が client・テーブル定義・演算子を各 app に配る。

## 目次

- [何に使っているか](#何に使っているか)
- [採用した理由（Prisma から移った理由）](#採用した理由prisma-から移った理由)
  - [Prisma と併存させずに一本化した理由](#prisma-と併存させずに一本化した理由)
  - [1.0 RC に固定している理由](#10-rc-に固定している理由)
- [挙動と注意点](#挙動と注意点)
  - [マイグレーション](#マイグレーション)
  - [CREATE INDEX CONCURRENTLY は書けない](#create-index-concurrently-は書けない)
  - [接続](#接続)
  - [enum 的な列は const から CHECK 制約を作る](#enum-的な列は-const-から-check-制約を作る)
  - [リードレプリカ](#リードレプリカ)
- [関連ドキュメント](#関連ドキュメント)

## 何に使っているか

| 用途 | 場所 |
| --- | --- |
| スキーマ定義（1 テーブル 1 ファイル） | `packages/db/src/drizzle/schema/` |
| マイグレーションの生成・適用（`drizzle-kit`） | `packages/db/drizzle/migrations/`。ローカル・CI・AWS の migration イメージで同じコマンドを使う |
| クエリ | 各 app の `src/repository/drizzle/`（Repository の実装） |

テーブル定義と演算子を使ってよいのは各 app の `src/repository/**` だけで、service 層は Repository の interface しか知らない
（`@repo/eslint-config/db-boundary` が lint で強制）。

## 採用した理由（Prisma から移った理由）

最初は Prisma を使っていた。**スキーマを TypeScript で書き、`@repo/domain` の定数を DB の定義にも使うため**に Drizzle に移った。

- 会員種別のような値の集合は `@repo/domain` が唯一の定義元。Drizzle のスキーマは TS なので、その定数から**列の型と `CHECK` 制約を作れる**（[後述](#enum-的な列は-const-から-check-制約を作る)）。Prisma のスキーマは独自の言語（`schema.prisma`）で、TS の定数を参照できず、値を書き写すことになる
- Prisma は `prisma generate` で client を生成してから使う。build・Docker・CI のそれぞれに生成のステップが要り、`@prisma/client` の peer 依存を消すための `.pnpmfile.cjs` も持っていた。Drizzle はスキーマの TS をそのまま import するので生成が無い

移行は 2 段階で行った。Repository を interface で切ってあったので、Drizzle の実装を足して DI を切り替えるだけで済んだ。
両実装に同じテストを流して振る舞いを揃え、マイグレーションの適用を Drizzle に移してから Prisma を消した。

### Prisma と併存させずに一本化した理由

Prisma に戻す予定が無く、残すと次の手間だけが続くため。

- `schema.prisma` を Drizzle のスキーマに合わせて手で直し続ける（二重管理）
- Repository のテストを両実装に流す
- build / Docker での `prisma generate`

### 1.0 RC に固定している理由

`drizzle-orm` / `drizzle-kit` は `1.0.0-rc.4` に固定している。0.45 系の migrator は「最後に適用したマイグレーションより新しい日付」のものだけを適用するので、
**別ブランチで先に作ったマイグレーションが後から merge されると、黙ってスキップする。** 1.0 は名前で照合するので取りこぼさない。

## 挙動と注意点

### マイグレーション

- **テーブルを変えるときは `src/drizzle/schema/` を変える。** `db:generate` でマイグレーションを作り、`db:migrate` で適用する（コマンドは [`packages/db/README.md`](../../packages/db/README.md#コマンド)）
- `db:migrate` は**未適用のマイグレーションをまとめて 1 つのトランザクションで流す**。途中で失敗すると全部ロールバックされるので、直して再実行すればよい
- 適用済みかどうかは**マイグレーション名**で判定する（`drizzle.__drizzle_migrations`）
- `db:generate` は列のリネームなど判断が要る差分で対話的に確認を求める。生成された SQL は必ず目で確認してからコミットする
- `drizzle-kit migrate` は DB が無いときに作らない。ローカルの test DB（`tech-english_test`）は `infra/postgres/init/` の初期化スクリプトが Postgres の初回起動時に作る

### CREATE INDEX CONCURRENTLY は書けない

全体が 1 つのトランザクションで流れるため、トランザクション内で実行できない `CREATE INDEX CONCURRENTLY` はマイグレーションに書けない（書くと `cannot run inside a transaction block` で失敗する）。

行数の多いテーブルに index を足すとき（通常の `CREATE INDEX` だと作成中の書き込みがブロックされる）は、マイグレーションとは別の手順にする。

1. 対象環境の DB で `CREATE INDEX CONCURRENTLY "<index 名>" ON ...` を手動で実行する
2. 同じ名前の index をスキーマに足して `db:generate` する
3. 生成された `CREATE INDEX` を `CREATE INDEX IF NOT EXISTS` に書き換える（手動で作った環境では何もせず、新しく作る DB では普通に作られる）

### 接続

- **セッションのタイムゾーンを UTC に固定している。** 日時の列は `timestamp`（タイムゾーン無し）で、Drizzle はこれを UTC として読み書きする。DB の default の `now()` はセッションのタイムゾーンで評価されるので、固定しないとローカル（docker-compose は `TZ=Asia/Tokyo`）では `created_at` が 9 時間ずれる（Prisma は client 側で値を埋めていたので起きなかった）。psql や Drizzle Studio など別の接続から `now()` を使って書き込むときも同じ理由でずれるので注意する
- **テーブル定義と演算子（`eq` / `and` …）は `@repo/db` から import する。** app に `drizzle-orm` を直接入れると、peer dependency の解決次第で別インスタンスになり、テーブル定義と演算子の型が噛み合わなくなるため。必要な演算子が増えたら `packages/db/src/index.ts` の re-export に足す
- pg の Pool はアイドル中の接続が切れると `error` を emit し、リスナが無いとプロセスが落ちる。`createDrizzleClient` の `onError` に各 app の logger を渡す

### enum 的な列は const から CHECK 制約を作る

会員種別のような値の集合は `@repo/domain` が唯一の定義元（[`packages/domain/README.md`](../../packages/domain/README.md)）。domain の定数から **列の型と DB の `CHECK` 制約の両方**を作り、値を書き写さない。Postgres の `enum` 型（`pgEnum`）は値の削除・リネームが難しいので使わない。

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
- DB が値を保証するので、Repository で `isMembershipTier` による検証は不要
- **domain に値を足すと API 契約も変わる。** 値の追加は API 契約の変更としてレビューする（`packages/domain/README.md`）

### リードレプリカ

`replicaUrl`（または `DATABASE_REPLICA_URL`）を指定すると、Drizzle の `withReplicas` が read / write を自動で振り分ける。**未指定なら replica は使わず、primary が read / write の両方を担う**。

| 操作 | 対象 |
| --- | --- |
| read → replica | `select` / `$count` / `with` / `query` |
| write → primary | `insert` / `update` / `delete` / `execute` / `transaction` |

replica は primary からの**レプリケーション遅延**があるため、直前に primary へ書き込んだ内容がまだ反映されていないことがある（書いた直後に read すると古い値が返りうる）。書き込み直後に必ず最新を読みたいときは、primary からの read を明示する。

```ts
/** replica を経由せず primary から read（最新が保証される） */
const [fresh] = await db.$primary.select().from(users).where(eq(users.id, id))
```

**Repository 規約**: replica の遅れが許されない読み取りは、`ReadOptions`（`{ fromPrimary: true }`）を受ける Repository メソッドで primary から読む（実装は `this._db.$primary`。例: apps/api の `ReadingAttemptRepository`。規約の正本は [`apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md)）。

## 関連ドキュメント

- [`packages/db/README.md`](../../packages/db/README.md) — ディレクトリ構成・コマンド・ローカル DB の作り直し・client の生成と DI
- [`packages/domain/README.md`](../../packages/domain/README.md) — enum 的な値の集合の定義元
- [`docs/onboarding/architecture.md`](../onboarding/architecture.md) — Repository の層と DI
- [Drizzle 公式ドキュメント](https://orm.drizzle.team/)
