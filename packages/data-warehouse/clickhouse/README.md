# clickhouse/

ClickHouse のテーブル・view の定義と、それを適用する migration コマンド。ライブラリの build には含めない。

ClickHouse の採用理由・CDC・view の規約・migration の書き方は [`docs/tech-stack/clickhouse/`](../../../docs/tech-stack/clickhouse/README.md) にまとめている。

## 構成

| パス | 中身 |
| --- | --- |
| `migrations/` | 版管理する migration（`<版番号>_<説明>.sql`）。1 回だけ適用する（[書き方](../../../docs/tech-stack/clickhouse/migration.md#版管理する-migration-の書き方)） |
| `views/` | CDC の view（`<CDC 対象のテーブル名>.sql`）。毎回作り直す（[書き方](../../../docs/tech-stack/clickhouse/migration.md#cdc-の-view-の書き方)） |
| `migrate/` | migration コマンドの実装 |

CDC の対象テーブルの一覧は、このディレクトリの外の `infra/clickhouse/cdc-tables.json` に置く（Terraform も読むため）。

## コマンド

```bash
pnpm --filter @repo/data-warehouse dwh:migrate
```

先に Postgres の migration（`pnpm --filter api db:migrate`）を流す。何をするかと環境変数は [`docs/tech-stack/clickhouse/migration.md`](../../../docs/tech-stack/clickhouse/migration.md)。
