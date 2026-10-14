# migration コマンド

ClickHouse に置くテーブル・view を適用するコマンド。ローカルでは手元で流し、AWS では deploy が ECS の one-shot タスクで流す。
実装は [`packages/data-warehouse/clickhouse/`](../../../packages/data-warehouse/clickhouse/README.md)。

## 目次

- [使い方](#使い方)
- [ClickHouse に置くもの](#clickhouse-に置くもの)
- [版管理する migration の書き方](#版管理する-migration-の書き方)
- [CDC の view の書き方](#cdc-の-view-の書き方)
- [環境変数](#環境変数)

## 使い方

```bash
pnpm --filter api db:migrate                      # 先に Postgres
pnpm --filter @repo/data-warehouse dwh:migrate    # ClickHouse
```

- **何度実行してもよい。** 版管理する migration は未適用のものだけを流し、CDC（ローカル）と view は毎回作り直す
- `dwh:migrate` は依存パッケージ（`@repo/logger`）を turbo でビルドしてから `dwh:migrate:run` を実行する。コンテナ（migration イメージ）ではビルド済みなので `dwh:migrate:run` を直接起動する
- 環境変数は turbo の `passThroughEnv`（`turbo.json` の `dwh:migrate:run`）で渡している。**新しい環境変数を足したらそこにも足す。** 足さないと turbo が渡さず、既定値のまま動く
- `DATA_WAREHOUSE_CDC=materialized_postgresql`（既定値）は `http` の ClickHouse にだけ使える。`https`（ClickHouse Cloud）に向けると env の検証で止まる

処理の順序:

1. `migrations/` のファイル名と、`infra/clickhouse/cdc-tables.json` と `views/` の対応を検査する（問題があれば DB に触る前に止まる）
2. ローカル（`DATA_WAREHOUSE_CDC=materialized_postgresql`）なら CDC を作り直し、全テーブルの取り込みを待つ（[ローカルの CDC](./cdc.md#ローカルの-cdc)）
3. [`clickhouse-migrations`](https://github.com/VVVi/clickhouse-migrations) で未適用の migration を適用する（database が無ければ作る）
4. CDC があれば（`DATA_WAREHOUSE_CDC` が `none` 以外）、`views/` の view を全部作り直す

## ClickHouse に置くもの

置き場所は `packages/data-warehouse/clickhouse/` からの相対パス。

| 種類 | 置き場所 | 適用のしかた |
| --- | --- | --- |
| 版管理する migration（`events`、将来のマテリアライズドビュー・集計テーブル） | `migrations/` | 各ファイルを 1 回だけ。適用済みは `<database>._migrations` に記録される |
| CDC の view（`v_users` / `v_memos`） | `views/` | 毎回作り直す（`CREATE OR REPLACE VIEW`） |
| CDC の対象テーブルの一覧 | `infra/clickhouse/cdc-tables.json`（リポジトリのルートから） | ローカルはこのコマンドが、ClickHouse Cloud は Terraform が反映する |
| CDC のテーブル本体（`pg_cdc.*`） | （取り込み側が作る） | ClickHouse Cloud ではこのコマンドから作らない・変えない。ローカルは毎回作り直す |

**view を作り直しても過去のデータは消えない。** 通常の view はデータを持たないため。マテリアライズドビューは作り直し方によってデータが消えるので、`views/` ではなく `migrations/` に書く。

CDC の対象テーブルを足す・消すときに変えるものと反映の順序は [`cdc.md`](./cdc.md#cdc-の対象を変えるとき)。

## 版管理する migration の書き方

- ファイル名は `<版番号>_<説明>.sql`（例: `2_create_daily_active_users.sql`）。**版番号は連番にする。** 履歴の列が UInt32 なので、タイムスタンプ形式（14 桁）は桁あふれする。同じ版番号が 2 つあるとコマンドが止まる
- **適用済みのファイルは書き換えない。** チェックサムが変わると `clickhouse-migrations` がエラーで止まる。直すときは新しいファイルを足す
- **何度流しても同じ結果になるように書く（`IF NOT EXISTS` / `IF EXISTS`）。** ClickHouse の DDL にはトランザクションが無く、途中で失敗すると次回はそのファイルを最初からやり直す
- テーブル名は database で修飾しない（接続先の `DATA_WAREHOUSE_DATABASE` に作られる）
- **環境で変わる内容を書かない。** local と ClickHouse Cloud で同じ SQL が通るようにする（ENGINE は `MergeTree` 系を書けば Cloud では自動で Shared 系になる。`ON CLUSTER` は書かない）
- `ALTER TABLE ... UPDATE / DELETE` などの mutation は非同期なので、終わるまで待たせたいときはファイルに `SET mutations_sync = 2;` を書く（そのファイルの全文に効く）。ただし**各文は 120 秒以内に終わること**（migration の request timeout）。超えると client 側がタイムアウトし、mutation はサーバーで続くのに履歴には記録されない。大きなテーブルへの重い mutation は `mutations_sync` を付けずに非同期に任せる
- **`pg_cdc` のテーブルを参照しない**（`DROP TABLE IF EXISTS pg_cdc.<table>` は除く。database が無くても通る）。参照するとコマンドが DB に触る前に止まる。CDC の無い環境（`DATA_WAREHOUSE_CDC=none`）や、ClickPipe の初回の取り込みの前には `pg_cdc` が無く、migration が失敗するため。CDC のデータを元にした集計は `views/` に書く（CDC のデータを元にしたマテリアライズドビューが要るときの扱いは未定）

## CDC の view の書き方

`views/<CDC 対象のテーブル名>.sql` に 1 文だけ書く。ファイル名と `cdc-tables.json` のテーブル名を 1 対 1 にする。

```sql
CREATE OR REPLACE VIEW v_users AS
SELECT * EXCEPT (${CDC_META_COLUMNS}) REPLACE (toUInt64(id) AS id)
FROM ${CDC_DATABASE}.users FINAL
WHERE ${CDC_LIVE_FILTER}
```

| 変数 | local（MaterializedPostgreSQL） | ClickHouse Cloud（ClickPipes） |
| --- | --- | --- |
| `${CDC_DATABASE}` | `pg_cdc` | `pg_cdc` |
| `${CDC_META_COLUMNS}` | `_sign, _version` | `_peerdb_synced_at, _peerdb_is_deleted, _peerdb_version` |
| `${CDC_LIVE_FILTER}` | `_sign = 1` | `_peerdb_is_deleted = 0` |

- **`SELECT *` で書く。** ClickHouse の view の列は作成時に固定されるが、毎回作り直すので Postgres 側の列の増減に追いつく
- **Postgres で列を消したら、`EXCEPT` にその列名を足す**（`EXCEPT (${CDC_META_COLUMNS}, old_column)`）。ClickPipes は消した列を ClickHouse 側に残す（以降は NULL）ため。`EXCEPT` は無い列を無視するので、列が本当に無くなるローカルでも同じ定義で動く
- view を消すときは、ファイルを消すだけでなく `migrations/` に `DROP VIEW IF EXISTS v_<table>;` を足す（このコマンドは消えた view を自動では消さない）
- view が何を吸収しているかは [view を経由する規約](./query.md#view-を経由する規約)

## 環境変数

既定値はローカルの docker compose で動く値なので、ローカルでは設定しなくてよい。AWS では ECS のタスク定義が設定する。

**docker compose の ClickHouse のポートを変えている（`CLICKHOUSE_HTTP_PORT`）ときは、`DATA_WAREHOUSE_URL=http://localhost:<port>` を付けて実行する。** 既定の `localhost:8124` で別のプロジェクトの ClickHouse が動いていると、そちらに繋がる。

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `DATA_WAREHOUSE_URL` | `http://localhost:8124` | ClickHouse の HTTP(S) の URL |
| `DATA_WAREHOUSE_USER` / `DATA_WAREHOUSE_PASSWORD` | `default` / `password` | |
| `DATA_WAREHOUSE_DATABASE` | `tech_english` | migration と view を置く database |
| `DATA_WAREHOUSE_CDC` | `materialized_postgresql` | `materialized_postgresql`（ローカル）/ `clickpipes`（ClickHouse Cloud）/ `none`（CDC なし。view を作らない） |
| `LOCAL_CDC_POSTGRES_HOST` / `_DATABASE` / `_USER` / `_PASSWORD` | `postgres:5432` / `tech-english_dev` / `postgres` / `password` | ローカルの MaterializedPostgreSQL が繋ぐ Postgres。**ClickHouse のコンテナから見た**接続先 |
