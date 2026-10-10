# @repo/data-warehouse

分析用データの書き込み先を抽象化するパッケージ。`DataWarehouse` interface と ClickHouse 実装、
何も書き込まない no-op 実装、それらを選ぶ factory を持つ。

## 目次

- [役割](#役割)
- [ClickHouse を採用した理由](#clickhouse-を採用した理由)
  - [他の候補と却下理由](#他の候補と却下理由)
  - [この抽象化で吸収できる範囲](#この抽象化で吸収できる範囲)
- [重複データの対策](#重複データの対策)
  - [なぜ重複するのか](#なぜ重複するのか)
  - [ReplacingMergeTree による畳み込み](#replacingmergetree-による畳み込み)
  - [集計時に FINAL を忘れると静かに数字が狂う](#集計時に-final-を忘れると静かに数字が狂う)
- [集計するデータと仕組み](#集計するデータと仕組み)
  - [行動イベント（events）](#行動イベントevents)
  - [業務データ（Postgres からの CDC）](#業務データpostgres-からの-cdc)
  - [view を経由する規約](#view-を経由する規約)
- [ローカルと prd の違い](#ローカルと-prd-の違い)
  - [ホスティング](#ホスティング)
  - [CDC の実装](#cdc-の実装)
  - [運用上の注意](#運用上の注意)
- [エラーの扱い](#エラーの扱い)
- [関連](#関連)

## 役割

- `DataWarehouse` interface を定義し、書き込み先の実装を隠す
- `createDataWarehouse` factory で実装を選ぶ。各 app の `src/index.ts` で 1 回呼んで Repository に DI する
- **クエリは持たない。** このパッケージは書き込み専用で、分析クエリは BI ツールや管理画面側の責務

## ClickHouse を採用した理由

行動イベントは業務データと**性質が正反対**で、同じデータベースに置くと互いの足を引っ張る。

| | 行動イベント | 業務データ（User / Memo） |
| --- | --- | --- |
| 書き込み量 | 1 セッションで数十件 | 操作ごとに 1 件 |
| 更新 | しない（append only） | する |
| トランザクション | 不要 | 必要 |
| 読み方 | 大量行を集計 | 1 行を id で引く |
| 消し方 | TTL で自動失効 | 明示的に削除 |

Postgres に相乗りさせると、イベントの書き込み量が業務テーブルと同じインスタンスを圧迫し、
集計クエリが本番の OLTP と資源を奪い合う。列指向でこの用途に最適化された ClickHouse を分ける。

### 他の候補と却下理由

| 候補 | 却下理由 |
| --- | --- |
| **Postgres のまま** | 上記のとおり OLTP と資源競合する。TTL による自動失効も自前実装が必要 |
| **BigQuery** | 方言が違いすぎる。後述のとおり抽象化で吸収できるのは書き込み経路だけで、移行コストの大半はクエリとダッシュボードの作り直し。本テンプレートは AWS 前提なのでクロスクラウドの前提ごと変わる場面でしか選ばない |
| **S3 + Athena** | スキャン課金でダッシュボードの常時参照に向かない。低レイテンシのクエリも期待できない |
| **運用ログ（pino）に混ぜる** | 保持期間が短く、量が行動イベントの数十倍。混ぜると分析基盤のコストが跳ね上がりスキーマが汚れる |

### この抽象化で吸収できる範囲

`@repo/clickhouse` ではなく役割名の `@repo/data-warehouse` にして interface を挟んでいるが、
**これが吸収するのは書き込み経路だけで、移行コスト全体の 1〜2 割程度にすぎない。**

現実的な乗り換え先は **同じ SQL 方言のマネージドサービス**（ClickHouse Cloud / Tinybird 等）で、
そこへならテーブル定義とクエリがそのまま使えるため本当に書き込み経路の差し替えだけで済む。
BigQuery のような別方言へは、この抽象化はほとんど効かない。

## 重複データの対策

### なぜ重複するのか

イベントの配送は BullMQ（`@repo/queue`）経由で、**at-least-once** である。worker が
ClickHouse への insert 後にクラッシュすると、同じジョブが再配信されて同じイベントが 2 回届く。

対策は **`eventId` を enqueue 時に採番する**こと（`packages/events/src/queue-tracker.ts`）。
worker 側で採番すると再配信のたびに別 ID になり、重複排除のキーが成立しない。

### ReplacingMergeTree による畳み込み

`events` テーブルは `ReplacingMergeTree` で、`ORDER BY` の末尾に `event_id` を置いている
（`infra/clickhouse/init/01-events.sql`）。同じ `event_id` の行はマージ時に 1 件に畳まれる。

**マージは非同期**なので、insert 直後は重複が見えている状態がありうる。

### 集計時に FINAL を忘れると静かに数字が狂う

畳み込みを待たずに正しい結果を得るには `FINAL` を付けるか `argMax` で最新を取る。
**忘れてもエラーにならず、件数が多く出るだけ**なので気付きにくい。

同じ罠は CDC したテーブルにもあり、そちらは削除行（タンブストーン）も絡む。
そのため**分析クエリは後述の view を経由する**規約にしている。

## 集計するデータと仕組み

### 行動イベント（events）

DB に痕跡が残らない操作（閲覧・削除・離脱）を取るのが主目的。送出は fire-and-forget で、
ユーザーのリクエストを待たせない。

```
[web / mobile] --POST /api/events--> [api] --enqueue--> [Redis/BullMQ]
                                                            |
                                            [worker] --insert--> [ClickHouse events]
```

- 送出の抽象は `@repo/events` の `EventTracker`。api は ClickHouse を知らない
- worker のハンドラは **`await` する**（送出側と逆）。握りつぶすと BullMQ がリトライしない
- 詳細は [`docs/spec/user-behavior-events/README.md`](../../docs/spec/user-behavior-events/README.md)

### 業務データ（Postgres からの CDC）

`events` には `user_id` しか入っていないため、「どんな属性のユーザーが何をしたか」を出すには
業務データも ClickHouse 側に必要になる。これを **CDC（論理レプリケーション）**で同期する。

```
[Postgres] --logical replication (pgoutput slot)--> [ClickHouse pg_cdc.*]
```

同期対象は `users` / `memos`。publication と replication slot は取り込み側が自動作成する。

**初回の `docker compose up` では view（後述）が作られない。** Postgres のテーブルは `db:migrate` で作るため、ClickHouse の初期化時点ではまだ無いから。テーブルは migrate の後に自動でアタッチされるので、migrate の後に `docker exec project-template-clickhouse bash /docker-entrypoint-initdb.d/03-postgres-cdc-views.sh` で view を作る（ルートの README のセットアップ手順に含めている）。

### view を経由する規約

CDC テーブルは更新を「新しい版の追記」、削除を「タンブストーン行」で表現する。
**分析クエリはこれらを直接参照せず、`project_template.v_*` の view を見る。**

```sql
-- ✓ OK
SELECT u.name, count() FROM events AS e
INNER JOIN v_users AS u ON u.id = e.user_id GROUP BY u.name
```

view が吸収しているのは 3 つ。

1. **`FINAL`** — 付け忘れると古い版が二重に数えられる
2. **削除行の除外** — ローカルは `_sign = 1`、prd は `_peerdb_is_deleted = 0`
3. **`id` の型** — Postgres の `integer` は `Int32` にマップされるが `events.user_id` は `UInt64` で、
   符号の有無が違うと共通型が無く `NO_COMMON_TYPE` で JOIN が落ちる。view 側で `toUInt64` する

**view の名前・列・型を両環境で揃え、定義だけを環境ごとに変える。** これで分析クエリは
どちらの環境でもそのまま動く。

## ローカルと prd の違い

### ホスティング

| | ローカル | dev | prd |
| --- | --- | --- | --- |
| ClickHouse | docker-compose（8124 / 9003） | **持たない** | ClickHouse Cloud |
| `DATA_WAREHOUSE_TYPE` | `clickhouse` | `none` | `clickhouse` |

**dev は ClickHouse をホスティングしない。** dev の行動ログに分析価値が無く、そのために
インスタンスを常駐させるのはコストに見合わないため。`DATA_WAREHOUSE_TYPE=none` にすると
`NoopDataWarehouse` が DI され、insert はスキップされる（ジョブは成功扱い）。

ClickHouse Cloud を選んだのは、**月額最低額が無くアイドル時に compute がゼロへスケールダウン**
するため。この規模ではストレージ費用が支配的で、それも年数 GB に収まる。

**本番で `none` にしてはいけない。** 呼び出し側から見ると insert は成功するので、
設定を間違えるとイベントが無言で消える。

### CDC の実装

**同じ「Postgres の論理レプリケーション」を使うが、WAL を読む主体が違う。**

| | ローカル | prd |
| --- | --- | --- |
| 取り込み | ClickHouse 内蔵 `MaterializedPostgreSQL` | ClickHouse Cloud の **ClickPipes** |
| 成熟度 | experimental | Beta |
| 削除の表現 | `_sign = -1` のタンブストーン | `_peerdb_is_deleted = 1` |
| 追加コンテナ | **なし** | （マネージド） |

prd の ClickPipes はマネージドサービスなのでローカルでは動かせない。逆にローカルの
`MaterializedPostgreSQL` は experimental なので prd では使わない。

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

## エラーの扱い

`insertAll` は失敗を `logger.error` に出してから re-throw する。リトライは呼び出し側
（worker / BullMQ）の責務で、ここでログを出さないと queue の汎用的なジョブ失敗としか残らない。

## 関連

- [`docs/spec/user-behavior-events/README.md`](../../docs/spec/user-behavior-events/README.md) — 行動イベント基盤の設計
- [`packages/events/`](../events) — 送出の抽象（`EventTracker`）
- [`packages/queue/`](../queue) — 配送の抽象（BullMQ）
- [`apps/worker/CLAUDE.md`](../../apps/worker/CLAUDE.md) — 消費側の実装と env
- [`infra/clickhouse/init/`](../../infra/clickhouse/init) — テーブル / CDC / view の定義
