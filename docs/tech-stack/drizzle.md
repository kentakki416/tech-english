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
  - [行数の多いテーブルの index は online.sql で作る](#行数の多いテーブルの-index-は-onlinesql-で作る)
  - [行数の多いテーブルで書き込みを止める変更](#行数の多いテーブルで書き込みを止める変更)
  - [既存の行の値を埋める](#既存の行の値を埋める)
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
- `db:migrate` は**未適用の `migration.sql` をまとめて 1 つのトランザクションで流す**。途中で失敗すると全部ロールバックされるので、直して再実行すればよい。未適用分に `online.sql` を持つフォルダがあるときは、そのフォルダごとに区切って commit する（[後述](#行数の多いテーブルの-index-は-onlinesql-で作る)）
- 適用済みかどうかは**マイグレーション名**で判定する（`drizzle.__drizzle_migrations`）
- `db:generate` は列のリネームなど判断が要る差分で対話的に確認を求める。生成された SQL は必ず目で確認してからコミットする
- `drizzle-kit migrate` は DB が無いときに作らない。ローカルの test DB（`tech-english_test`）は `infra/postgres/init/` の初期化スクリプトが Postgres の初回起動時に作る

### 行数の多いテーブルの index は online.sql で作る

drizzle-kit は `migration.sql` を 1 つのトランザクションで流すので、トランザクション内で実行できない `CREATE INDEX CONCURRENTLY` は `migration.sql` に書けない（書くと `cannot run inside a transaction block` で失敗する）。通常の `CREATE INDEX` は作成が終わるまで対象テーブルへの書き込みを止めるので、行数の多いテーブルの index は、マイグレーションのフォルダに置く `online.sql` で作る。

- **スキーマの index に `.concurrently()` を付けて `db:generate` する。** 生成された `CREATE INDEX CONCURRENTLY` は、`IF NOT EXISTS` を付けて同じフォルダの `online.sql` に移る（手で SQL を動かさない）
- **`db:migrate` は、フォルダの名前順に `migration.sql` と `online.sql` を交互に流す。** `online.sql` を持つ未適用のフォルダごとに、そこまでの `migration.sql` を適用してから、そのフォルダの `online.sql` をトランザクションの外で 1 文ずつ流す。`online.sql` を、書かれた時点のスキーマに対して流すため（先の `migration.sql` まで適用してから流すと、カラムの rename などでスキーマが変わっていて失敗する）。ローカル・テスト・CI・本番で同じ
- drizzle-kit migrate は「ここまで適用する」を指定できないので、そこまでのフォルダだけを写した一時ディレクトリを見せて流す（`drizzle.config.ts` の `out` を環境変数 `DRIZZLE_MIGRATIONS_DIR` で差し替える）
- **`drizzle-kit migrate` を直接実行しない。** `online.sql` を飛ばして先の `migration.sql` まで進み、後から流した `online.sql` が失敗することがある。必ず `db:migrate` を使う
- `online.sql` を適用したフォルダは `drizzle.__online_migrations` テーブルに記録する。途中で失敗したフォルダは記録されず、次の `db:migrate` で先頭から流し直す
- `CREATE INDEX CONCURRENTLY` が途中で失敗すると無効な index が残る。次の実行で消して作り直し、作成後に有効になったことを確かめる
- `online.sql` に書けるのは `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS` と `DROP INDEX CONCURRENTLY IF EXISTS` だけ（どちらも何度流しても同じ結果になるので、失敗したフォルダを流し直せる）
- 行数の少ないテーブルや、同じマイグレーションで作るテーブルの index は、`.concurrently()` を付けなくてよい
- deploy の migrate ジョブがタスクの終了を待つのは 10 分まで（`aws ecs wait tasks-stopped`）。作成が 10 分を超える index は、待ちの上限を伸ばしてから流す

### 行数の多いテーブルで書き込みを止める変更

行数の多いテーブルでは、素直に書いたマイグレーションが、終わるまで対象テーブルへの書き込み（強いロックでは読み取りも）を止めることがある。CI では検出しないので、マイグレーションを書く人とレビューする人が、次の表で確かめる。行数の少ないテーブルは、検査や書き換えが一瞬で終わるので、ロック待ち（表の下の注意）のほかは気にしなくてよい。

| 変更 | 素直に書いたとき | 止めない書き方 |
| --- | --- | --- |
| index の追加 | 作成が終わるまで書き込みを止める | index に `.concurrently()` を付ける（[上の節](#行数の多いテーブルの-index-は-onlinesql-で作る)） |
| index の削除 | 読み書きを止めるロックを取るが、一瞬で終わる | そのままでよい（止めずに消したいときは、生成された `migration.sql` から `DROP INDEX` を消し、同じフォルダの `online.sql` に `DROP INDEX CONCURRENTLY IF EXISTS` を書く） |
| カラムの追加（NULL 可、または default が定数） | テーブルを書き換えないので一瞬で終わる | そのままでよい |
| カラムの追加（default が行ごとに変わる式。`gen_random_uuid()` など） | 全行を書き換え、終わるまで読み書きを止める | default 無しで追加 → default を設定（`SET DEFAULT` は以降の INSERT にだけ効き、書き換えない）→ 既存の行の値を埋める。drizzle-kit は default 付きの `ADD COLUMN` を 1 文で生成するので、手で `ADD COLUMN` と `ALTER COLUMN ... SET DEFAULT` の 2 文に分ける |
| CHECK 制約 / 外部キーの追加 | 全行を検査する間、CHECK は対象テーブルの読み書きを、外部キーは両方のテーブルの書き込みを止める | `NOT VALID` を付けて追加し、それを適用した後の deploy で `VALIDATE CONSTRAINT` する |
| UNIQUE 制約の追加（カラムの `.unique()` など） | index を作る間、読み書きを止める | 制約ではなく unique index にして、`uniqueIndex(...).concurrently()` で作る |
| カラムに `NOT NULL` を付ける | 全行を検査する間、読み書きを止める | 値が空の行を埋める → `CHECK (col IS NOT NULL) NOT VALID` を追加 → それを適用した後の deploy で `VALIDATE CONSTRAINT` → `SET NOT NULL` → CHECK を削除（`NOT VALID` の CHECK も以降の UPDATE には効くので、先に埋めないと、値が空の行への UPDATE が失敗する） |
| カラムの型の変更 | 多くの場合、全行を書き換えて読み書きを止める | 新しいカラムを追加 → アプリが両方に書く → 既存の行の値を埋める → 読み先を切り替え → 古いカラムに書くのをやめる → 古いカラムを削除 |
| 既存の行の値を埋める（全行の `UPDATE`） | 1 つの長いトランザクションになり、更新した行のロックを最後まで保持する | [次の節](#既存の行の値を埋める) |

- `NOT VALID` と `VALIDATE CONSTRAINT` は drizzle-kit が生成しない。生成された `migration.sql` に `NOT VALID` を手で足し、`VALIDATE CONSTRAINT` は `db:generate --custom` で作ったマイグレーションに書く
- `VALIDATE CONSTRAINT` を別の deploy に分けるのは、同じ deploy の未適用分が 1 つのトランザクションで流れるため。同じトランザクションに入ると、制約の追加で取った強いロックを、検査が終わるまで保持する。deploy は手動で起動するので、`NOT VALID` の PR と `VALIDATE CONSTRAINT` の PR を両方マージしてから deploy しない（`NOT VALID` を各環境に適用してから、`VALIDATE CONSTRAINT` の PR をマージする）。`VALIDATE CONSTRAINT` と同じ deploy に、同じテーブルへのほかの変更（カラムの追加など）も入れない。先に流れた変更のロックを、検査が終わるまで保持する
- `VALIDATE CONSTRAINT` は書き込みを止めないが、全行を検査する間 deploy の migrate ジョブが待つ。ジョブがタスクの終了を待つのは 10 分まで（上の節）
- 一瞬で終わる変更も、強いロックを取るときに長いトランザクションの後ろで待つと、その後ろに来た読み書きも一緒に待たされる。待ち時間の上限（`lock_timeout`）は設定していないので、行数の多いテーブルへの変更は、アクセスの少ない時間帯に deploy する
- `@repo/domain` の定数に値を足すと、`CHECK` を差し替える SQL が生成される（[後述](#enum-的な列は-const-から-check-制約を作る)）。行数の多いテーブルでは、上の「CHECK 制約の追加」の書き方に直す

### 既存の行の値を埋める

スキーマの変更はマイグレーションで管理し、既存の行の値を埋める作業（バックフィル）は、テーブルの大きさで分ける。値を埋める仕組みは持たない。行数の多いテーブルでは頻度が低く、1 回分の件数・待ち時間・流す時間帯を毎回見て決めるため。

| 場面 | やり方 |
| --- | --- |
| 定数を入れるだけ | `ADD COLUMN ... DEFAULT ...` にする。Postgres が既存の行にも一瞬で値を持たせるので、埋める作業は要らない |
| 行数の少ないテーブル | `db:generate --custom` で作ったマイグレーションに `UPDATE` を書く |
| 行数の多いテーブル | 手動で、少しずつに分けた `UPDATE`（未処理の行を数千行ずつ選んで更新し、その都度 commit する）を流す。終わってから、制約を付けるマイグレーションを入れる |

手動の `UPDATE` は、既に行のある環境（dev / min / prd、データを入れたローカル、バックアップから復元した DB）ごとに、制約を付けるマイグレーションを適用する前に流す。新しく作る DB には既存の行が無いので、マイグレーションのように、後から作る環境でも再現できる形で残す必要は無い。

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

- **値を足したら `db:generate` する。** `CHECK` を差し替える SQL（`DROP CONSTRAINT ..., ADD CONSTRAINT ...`）が自動で生成される。差し替え時に既存の全行を検査するので、行数の多いテーブルでは [`NOT VALID` を使う書き方](#行数の多いテーブルで書き込みを止める変更)にする
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

- [`packages/db/README.md`](../../packages/db/README.md) — ディレクトリ構成・コマンド・マイグレーションの手順・ローカル DB の作り直し・client の生成と DI
- [`packages/domain/README.md`](../../packages/domain/README.md) — enum 的な値の集合の定義元
- [`docs/onboarding/architecture.md`](../onboarding/architecture.md) — Repository の層と DI
- [Drizzle 公式ドキュメント](https://orm.drizzle.team/)
