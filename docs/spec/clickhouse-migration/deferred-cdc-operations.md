# CDC の運用強化（MVP 対象外）

[`./README.md`](./README.md) の MVP では、CDC（Postgres → ClickHouse）を「張れる・変更に追いつける」ところまでにとどめる。本ドキュメントは、本番の分析に CDC を使い始めた後に必要になる運用面の強化をまとめる。

## 着手トリガー

| 項目 | 着手するとき |
| --- | --- |
| replication slot の監視 | prd で `enable_cdc = true` にして実データを流し始める前 |
| 専用のレプリケーションユーザー | セキュリティレビューで指摘されたとき、または ClickHouse Cloud 側の認証情報の管理者を app と分けたいとき |
| min の CDC | min で業務データを使った分析が必要になったとき |
| 付け外し・再同期の自動化 | CDC 対象のテーブル追加・名前変更・型変更が月に数回以上起きるようになったとき |
| CI での検証 | ClickHouse の migration の失敗が deploy で初めて見つかる事故が起きたとき |
| 変更漏れの検知 | CDC 対象テーブルの列を変えたのに view の除外列や再同期を忘れる事故が起きたとき |
| CDC のデータを元にしたマテリアライズドビュー | CDC のデータの集計が view では遅すぎるようになったとき |

## 対象範囲

| | MVP | 本ドキュメント |
| --- | --- | --- |
| ClickPipe の作成と同期対象の管理 | Terraform（`cdc-tables.json`） | 同じ |
| 認証 | RDS のマスターユーザー | 専用ユーザー（`rds_replication` + 対象テーブルの `SELECT` だけ） |
| 監視 | ClickHouse Cloud のコンソールを人が見る | replication slot のラグを CloudWatch でアラート |
| min | CDC なし | PlanetScale Postgres を取り込み元にした ClickPipe |
| 付け外し・再同期 | 手順書に沿って apply / 手動の再実行 | deploy workflow が OpenAPI で行う |
| CI | ユニットテストだけ | PR で ClickHouse のコンテナに migration を流す |

## 設計案

### replication slot の監視

- **slot が止まると Postgres が WAL を消せず、ディスクが埋まって書き込みが止まる。** ClickPipe が停止・失敗したまま気づかないと本番障害になる
- RDS の CloudWatch メトリクス `OldestReplicationSlotLag`（バイト）にアラームを付ける。閾値はディスクの空きから逆算する（例: 割り当てストレージの 20%）
- MVP で `max_slot_wal_keep_size` の上限は付けてあるので、ディスクが埋まって DB が止まることは無い。ただし上限を超えると slot が無効になり CDC が黙って止まるため、slot が無効になったことにも気づけるようにする（ClickPipe の状態の通知か、ClickHouse 側のデータの鮮度の監視）

### 専用のレプリケーションユーザー

- Terraform で `random_password` を作り、data-warehouse の secret とは別の secret に置く
- VPC 内からしか RDS に繋がらないため、`CREATE ROLE` は dwh-migration のタスク（`DATABASE_URL` を追加で渡す）が冪等に行う: `CREATE ROLE ... LOGIN PASSWORD ...` / `GRANT rds_replication` / `GRANT SELECT ON ALL TABLES IN SCHEMA public` / `ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES`
- ClickPipe の作成は「ユーザーができた後」でないと失敗するため、初回は apply（secret・bastion）→ deploy（ユーザー作成）→ apply（ClickPipe）の順になる。`enable_cdc` とは別に ClickPipe の作成を遅らせる仕組み（変数か `count` の条件）が要る

### min の CDC

- ClickPipes は PlanetScale Postgres に対応している（Terraform の `type = "planetscale"`）。ただし PlanetScale Postgres 自体が early access
- ユーザー名は `<user>.<branch>` の形、ポートは 5432（PSBouncer の 6432 は不可）、primary に繋ぐ。`wal_level` の変更でクラスタが再起動する
- 接続経路は不要（公開エンドポイント）。bastion も作らない

### 付け外し・再同期の自動化

- deploy の `migrate`（Drizzle）の後に、`cdc-tables.json` と ClickPipe の現状の差分を取り、OpenAPI の `tableMappingsToAdd` / `tableMappingsToRemove` で反映する
- Terraform と deploy の両方が ClickPipe を触ることになるため、Terraform 側の `table_mappings` は `ignore_changes` にする
- 型変更（ケース 4）の検知は難しい。Drizzle の migration の SQL を見て CDC 対象テーブルへの `ALTER COLUMN` を検出したら再同期する、などの工夫が要る

### CI での検証

- `test.yml` に ClickHouse の service container を足し、`pnpm --filter @repo/data-warehouse dwh:migrate:run` を `DATA_WAREHOUSE_CDC=none` で流す（CDC は Postgres の論理レプリケーションが要るので対象外）
- 版管理する migration の構文エラーと、空の DB に全部流せることを PR で保証できる

### 変更漏れの検知

- Drizzle の migration（`packages/db/drizzle/migrations/*.sql`）が CDC 対象テーブルに `DROP COLUMN` / `ALTER COLUMN ... TYPE` / `RENAME` を含むとき、PR にコメントで「view の除外列 / 再同期が要る」と知らせる

### CDC のデータを元にしたマテリアライズドビュー

- 版管理する migration は `pg_cdc` を参照できない（CDC の無い環境や初回の取り込みの前に失敗する。migration コマンドが実行前に弾く）
- CDC のある環境にだけ適用する仕組み（`views/` と同じく `DATA_WAREHOUSE_CDC` を見て、`none` なら飛ばす migration の置き場所）を足し、作り直し方でデータが消えないように 1 回だけ適用する

## 既存仕様との差分（着手時のチェックリスト）

- [ ] `README.md` の「環境ごとの構成」「CDC（ClickPipes）」の認証・監視の記述を更新する
- [ ] min の `variables.tf` に `enable_cdc` を足し、`enable_data_warehouse` との検証を入れる
- [ ] `docs/tech-stack/clickhouse/cdc.md` の「運用上の注意」から「slot ラグの監視は未実装」を消す
- [ ] 付け外しを自動化したら、`README.md` の「変更のケースごとの作業」の順序の列を書き換える
