# ClickHouse

`@repo/data-warehouse` を ClickHouse で実現するためのもの一式。書き込みの実装（`../src/clickhouse/`）、
テーブル・view の定義（`migrations/` / `views/`）、それを適用する migration コマンド（`migrate/`）を持つ。
パッケージの役割とデータウェアハウスへの要件は [`../README.md`](../README.md) に書く。

設計: [`docs/spec/clickhouse-migration/README.md`](../../../docs/spec/clickhouse-migration/README.md)（migration と環境ごとの有効化）

## 目次

- [採用した理由](#採用した理由)
  - [他の候補と却下理由](#他の候補と却下理由)
- [ホスティング](#ホスティング)
- [events テーブル](#events-テーブル)
  - [集計時に FINAL を忘れると静かに数字が狂う](#集計時に-final-を忘れると静かに数字が狂う)
- [CDC（Postgres からの取り込み）](#cdcpostgres-からの取り込み)
  - [ローカルと ClickHouse Cloud の違い](#ローカルと-clickhouse-cloud-の違い)
  - [運用上の注意](#運用上の注意)
- [view を経由する規約](#view-を経由する規約)
- [migration コマンド](#migration-コマンド)
  - [ClickHouse に置くもの](#clickhouse-に置くもの)
  - [版管理する migration の書き方](#版管理する-migration-の書き方)
  - [CDC の view の書き方](#cdc-の-view-の書き方)
  - [CDC の対象を変えるとき](#cdc-の対象を変えるとき)
  - [ローカルの CDC](#ローカルの-cdc)
  - [環境変数](#環境変数)

## 採用した理由

[パッケージの要件](../README.md#データウェアハウスに求める要件)を次のように満たす。

| 要件 | ClickHouse での実現 |
| --- | --- |
| 追記だけの大量の書き込みと、大量行の集計 | 列指向で、この用途に最適化されている |
| 古いイベントを TTL で自動で消す | テーブル定義の `TTL` |
| 同じイベントを 1 件に畳む | `ReplacingMergeTree`（[後述](#events-テーブル)） |
| Postgres の業務データを CDC で取り込む | ローカルは `MaterializedPostgreSQL`、ClickHouse Cloud は ClickPipes（[後述](#cdcpostgres-からの取り込み)） |
| リクエストが無いときの費用が小さい | ClickHouse Cloud は月額最低額が無く、アイドル時に compute がゼロへスケールダウンする |

### 他の候補と却下理由

| 候補 | 却下理由 |
| --- | --- |
| **Postgres のまま** | OLTP と資源競合する（[`../README.md`](../README.md#データウェアハウスに求める要件)）。TTL による自動失効も自前実装が必要 |
| **BigQuery** | 方言が違いすぎる。抽象化で吸収できるのは書き込み経路だけで、移行コストの大半はクエリとダッシュボードの作り直し。このプロジェクトは AWS 前提なのでクロスクラウドの前提ごと変わる場面でしか選ばない |
| **S3 + Athena** | スキャン課金でダッシュボードの常時参照に向かない。低レイテンシのクエリも期待できない |
| **運用ログ（pino）に混ぜる** | 保持期間が短く、量が行動イベントの数十倍。混ぜると分析基盤のコストが跳ね上がりスキーマが汚れる |

乗り換えるなら、同じ SQL 方言のマネージドサービス（Tinybird 等）が現実的。テーブル定義とクエリがそのまま使えるため、
書き込み経路の差し替えだけで済む。

## ホスティング

| | ローカル | dev | prd |
| --- | --- | --- | --- |
| ClickHouse | docker-compose（8124 / 9003） | **持たない** | ClickHouse Cloud |
| `DATA_WAREHOUSE_TYPE` | `clickhouse` | `none` | `clickhouse` |

**dev は ClickHouse をホスティングしない。** dev の行動ログに分析価値が無く、そのために
インスタンスを常駐させるのはコストに見合わないため。

ClickHouse Cloud を選んだのは、**月額最低額が無くアイドル時に compute がゼロへスケールダウン**
するため。この規模ではストレージ費用が支配的で、それも年数 GB に収まる。

## events テーブル

`events`（`migrations/1_create_events.sql`）は `ReplacingMergeTree` で、`ORDER BY` の末尾に `event_id` を置いている。
同じ `event_id` の行はマージ時に 1 件に畳まれる（[同じイベントが 2 回届く](../README.md#同じイベントが-2-回届く)ことへの対策）。
月ごとにパーティションを切り、2 年で TTL により消える。

**マージは非同期**なので、insert 直後は重複が見えている状態がありうる。

### 集計時に FINAL を忘れると静かに数字が狂う

畳み込みを待たずに正しい結果を得るには `FINAL` を付けるか `argMax` で最新を取る。
**忘れてもエラーにならず、件数が多く出るだけ**なので気付きにくい。

同じ罠は CDC したテーブルにもあり、そちらは削除行（タンブストーン）も絡む。
そのため**分析クエリは [view を経由する](#view-を経由する規約)**規約にしている。

## CDC（Postgres からの取り込み）

```mermaid
flowchart LR
    P[(Postgres)] -->|論理レプリケーション<br/>pgoutput の slot| T[(ClickHouse の pg_cdc.*)]
    T --> V[view v_*]
```

同期対象は `infra/clickhouse/cdc-tables.json` に並べたテーブル（今は `users` / `memos`）。publication と
replication slot は取り込み側が自動作成する。取り込んだテーブルは `pg_cdc` database に入り、
分析クエリは `tech_english.v_*` の view から読む。ローカルの CDC（MaterializedPostgreSQL）と、両方の環境の view は [migration コマンド](#migration-コマンド)が作る。ClickHouse Cloud の CDC（ClickPipe）は Terraform が作る。

### ローカルと ClickHouse Cloud の違い

**同じ「Postgres の論理レプリケーション」を使うが、WAL を読む主体が違う。**

| | ローカル | ClickHouse Cloud |
| --- | --- | --- |
| 取り込み | ClickHouse 内蔵 `MaterializedPostgreSQL` | **ClickPipes** |
| 成熟度 | experimental | Beta |
| 削除の表現 | `_sign = -1` のタンブストーン | `_peerdb_is_deleted = 1` |
| 追加コンテナ | **なし** | （マネージド） |

ClickPipes はマネージドサービスなのでローカルでは動かせない。逆にローカルの
`MaterializedPostgreSQL` は experimental なので ClickHouse Cloud では使わない。

**揃えているのは Postgres 側の契約**（`wal_level=logical` / publication の自動作成 /
`pgoutput` の replication slot）で、運用で実際に事故るのはこの層。ClickHouse 側の差分は
view 定義に閉じ込めている。

ClickPipes と同じエンジン（PeerDB）をローカルでセルフホストする選択肢もあるが、
catalog Postgres / Temporal / MinIO を含む **11 サービス**が増え、ダッシュボードが
ポート 3000 で `apps/web` と衝突するため採らなかった。

### 運用上の注意

- **replication slot は WAL を保持する。** 取り込み側が止まると Postgres のディスクが WAL で
  埋まって書き込み不能になる。prd では slot ラグの監視が事実上必須（**未実装**）
- 反映は同期ではない。ローカルでの実測は数秒〜10 秒程度で、再起動直後は長めに出る
- ローカルで `pg_cdc` を消すときは `DROP DATABASE pg_cdc`。slot と publication も一緒に消える。
  手で消さずに放置すると docker volume が WAL で膨らみ続ける

## view を経由する規約

CDC テーブルは更新を「新しい版の追記」、削除を「タンブストーン行」で表現する。
**分析クエリはこれらを直接参照せず、`tech_english.v_*` の view を見る。**

```sql
-- ✓ OK
SELECT u.name, count() FROM events AS e
INNER JOIN v_users AS u ON u.id = e.user_id GROUP BY u.name
```

view が吸収しているのは 3 つ。

1. **`FINAL`** — 付け忘れると古い版が二重に数えられる
2. **削除行の除外** — ローカルは `_sign = 1`、ClickHouse Cloud は `_peerdb_is_deleted = 0`
3. **`id` の型** — Postgres の `integer` は `Int32` にマップされるが `events.user_id` は `UInt64` で、
   符号の有無が違うと共通型が無く `NO_COMMON_TYPE` で JOIN が落ちる。view 側で `toUInt64` する

**view の名前・列・型を両環境で揃え、定義だけを環境ごとに変える。** これで分析クエリは
どちらの環境でもそのまま動く。

## migration コマンド

ClickHouse に置くテーブル・view を適用する。ローカルでは手元で流し、AWS では deploy が ECS の one-shot タスクで流す。

```bash
pnpm --filter api db:migrate                      # 先に Postgres
pnpm --filter @repo/data-warehouse dwh:migrate    # ClickHouse
```

- **何度実行してもよい。** 版管理する migration は未適用のものだけを流し、CDC（ローカル）と view は毎回作り直す
- `dwh:migrate` は依存パッケージ（`@repo/logger`）を turbo でビルドしてから `dwh:migrate:run` を実行する。コンテナ（migration イメージ）ではビルド済みなので `dwh:migrate:run` を直接起動する
- 環境変数は turbo の `passThroughEnv`（`turbo.json` の `dwh:migrate:run`）で渡している。**新しい環境変数を足したらそこにも足す。** 足さないと turbo が渡さず、既定値のまま動く
- ローカルの CDC を作り直す前に、既にある `pg_cdc` がこのプロジェクトの Postgres を取り込むものか確かめ、違えば消さずに止まる（同じテンプレートから作った別プロジェクトの ClickHouse が同じポートで動いているときに、その CDC を消さないため）
- `DATA_WAREHOUSE_CDC=materialized_postgresql`（既定値）は `http` の ClickHouse にだけ使える。`https`（ClickHouse Cloud）に向けると env の検証で止まる

処理の順序:

1. `migrations/` のファイル名と、`infra/clickhouse/cdc-tables.json` と `views/` の対応を検査する（問題があれば DB に触る前に止まる）
2. ローカル（`DATA_WAREHOUSE_CDC=materialized_postgresql`）なら CDC を作り直し、全テーブルの取り込みを待つ
3. [`clickhouse-migrations`](https://github.com/VVVi/clickhouse-migrations) で未適用の migration を適用する（database が無ければ作る）
4. CDC があれば（`DATA_WAREHOUSE_CDC` が `none` 以外）、`views/` の view を全部作り直す

### ClickHouse に置くもの

| 種類 | 置き場所 | 適用のしかた |
| --- | --- | --- |
| 版管理する migration（`events`、将来のマテリアライズドビュー・集計テーブル） | `migrations/` | 各ファイルを 1 回だけ。適用済みは `<database>._migrations` に記録される |
| CDC の view（`v_users` / `v_memos`） | `views/` | 毎回作り直す（`CREATE OR REPLACE VIEW`） |
| CDC の対象テーブルの一覧 | `infra/clickhouse/cdc-tables.json` | ローカルはこのコマンドが、ClickHouse Cloud は Terraform が反映する |
| CDC のテーブル本体（`pg_cdc.*`） | （取り込み側が作る） | ClickHouse Cloud ではこのコマンドから作らない・変えない。ローカルは毎回作り直す（[後述](#ローカルの-cdc)） |

**view を作り直しても過去のデータは消えない。** 通常の view はデータを持たないため。マテリアライズドビューは作り直し方によってデータが消えるので、`views/` ではなく `migrations/` に書く。

### 版管理する migration の書き方

- ファイル名は `<版番号>_<説明>.sql`（例: `2_create_daily_active_users.sql`）。**版番号は連番にする。** 履歴の列が UInt32 なので、タイムスタンプ形式（14 桁）は桁あふれする。同じ版番号が 2 つあるとコマンドが止まる
- **適用済みのファイルは書き換えない。** チェックサムが変わると `clickhouse-migrations` がエラーで止まる。直すときは新しいファイルを足す
- **何度流しても同じ結果になるように書く（`IF NOT EXISTS` / `IF EXISTS`）。** ClickHouse の DDL にはトランザクションが無く、途中で失敗すると次回はそのファイルを最初からやり直す
- テーブル名は database で修飾しない（接続先の `DATA_WAREHOUSE_DATABASE` に作られる）
- **環境で変わる内容を書かない。** local と ClickHouse Cloud で同じ SQL が通るようにする（ENGINE は `MergeTree` 系を書けば Cloud では自動で Shared 系になる。`ON CLUSTER` は書かない）
- `ALTER TABLE ... UPDATE / DELETE` などの mutation は非同期なので、終わるまで待たせたいときはファイルに `SET mutations_sync = 2;` を書く（そのファイルの全文に効く）。ただし**各文は 120 秒以内に終わること**（migration の request timeout）。超えると client 側がタイムアウトし、mutation はサーバーで続くのに履歴には記録されない。大きなテーブルへの重い mutation は `mutations_sync` を付けずに非同期に任せる
- **`pg_cdc` のテーブルを参照しない**（`DROP TABLE IF EXISTS pg_cdc.<table>` は除く。database が無くても通る）。参照するとコマンドが DB に触る前に止まる。CDC の無い環境（`DATA_WAREHOUSE_CDC=none`）や、ClickPipe の初回の取り込みの前には `pg_cdc` が無く、migration が失敗するため。CDC のデータを元にした集計は `views/` に書く（CDC のデータを元にしたマテリアライズドビューが要るときの扱いは未定）

### CDC の view の書き方

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
- view が何を吸収しているかは [view を経由する規約](#view-を経由する規約)

### CDC の対象を変えるとき

Postgres の変更と同じ PR で、ClickHouse 側の変更も入れる。ケースごとの作業と、ClickHouse Cloud に反映する順序は設計書の表を見る: [変更のケースごとの作業](../../../docs/spec/clickhouse-migration/README.md#変更のケースごとの作業)。

| ケース | ここでやること |
| --- | --- |
| CDC 対象のテーブルを足す | `cdc-tables.json` に足し、`views/<table>.sql` を足す |
| CDC 対象のテーブルを消す・名前を変える | 1 回目: `cdc-tables.json` と `views/<table>.sql` から消し、`DROP VIEW IF EXISTS` の migration を足す。2 回目: `DROP TABLE IF EXISTS pg_cdc.<table>` の migration を足す |
| 列を足す・型や名前を変える | 不要 |
| 列を消す | view の `EXCEPT` に列名を足す |
| ClickHouse だけの変更 | `migrations/` にファイルを足す |

### ローカルの CDC

ローカルでは ClickHouse の MaterializedPostgreSQL で Postgres を取り込む。**migration コマンドは毎回 `pg_cdc` を消して作り直す。**

- MaterializedPostgreSQL は Postgres 側で列が変わるとそのテーブルの同期を止める。ClickHouse のドキュメントにある「テーブルを付け直す」では、ClickHouse 24.10 で付け直した後の変更が反映されなかったため、database ごと作り直している
- 作り直すと replication slot と publication も作り直され、全件を取り込み直す。ローカルのデータは少ないので数秒で終わる
- Postgres にテーブルが無いと 60 秒待って失敗する。先に `pnpm --filter api db:migrate` を流す
- ローカルの Postgres の DB を消すときは、先に `pg_cdc` を消す（replication slot が残っていると `DROP DATABASE` できない）。手順は [`packages/db/README.md`](../../db/README.md#prisma-で作ったローカル-db-の作り直し一度だけ)

### 環境変数

既定値はローカルの docker compose で動く値なので、ローカルでは設定しなくてよい。AWS では ECS のタスク定義が設定する。

**docker compose の ClickHouse のポートを変えている（`CLICKHOUSE_HTTP_PORT`）ときは、`DATA_WAREHOUSE_URL=http://localhost:<port>` を付けて実行する。** 既定の `localhost:8124` で別のプロジェクトの ClickHouse が動いていると、そちらに繋がる。

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `DATA_WAREHOUSE_URL` | `http://localhost:8124` | ClickHouse の HTTP(S) の URL |
| `DATA_WAREHOUSE_USER` / `DATA_WAREHOUSE_PASSWORD` | `default` / `password` | |
| `DATA_WAREHOUSE_DATABASE` | `tech_english` | migration と view を置く database |
| `DATA_WAREHOUSE_CDC` | `materialized_postgresql` | `materialized_postgresql`（ローカル）/ `clickpipes`（ClickHouse Cloud）/ `none`（CDC なし。view を作らない） |
| `LOCAL_CDC_POSTGRES_HOST` / `_DATABASE` / `_USER` / `_PASSWORD` | `postgres:5432` / `tech-english_dev` / `postgres` / `password` | ローカルの MaterializedPostgreSQL が繋ぐ Postgres。**ClickHouse のコンテナから見た**接続先 |
