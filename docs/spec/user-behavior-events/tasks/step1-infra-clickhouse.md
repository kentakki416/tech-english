# step1-infra-clickhouse

ClickHouse をローカル環境に追加し、`events` テーブルとデータウェアハウス抽象 `@repo/data-warehouse` を用意する。

## 対応内容

### docker-compose に ClickHouse を追加

既存の postgres / redis と同じく **既定ポートをずらす**（他プロジェクトとの衝突を避けるため）。

```yaml
  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    environment:
      CLICKHOUSE_DB: project_template
      CLICKHOUSE_USER: default
      CLICKHOUSE_PASSWORD: password
      # 開発用。本番は IAM / ネットワーク側で絞る
      CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: 1
    ports:
      # 既定 8123 / 9000 をそのまま使うと他プロジェクトと衝突しうるためずらす
      - '${CLICKHOUSE_HTTP_PORT:-8124}:8123'
      - '${CLICKHOUSE_NATIVE_PORT:-9003}:9000'
    volumes:
      - clickhouse-data:/var/lib/clickhouse
      - ./infra/clickhouse/init:/docker-entrypoint-initdb.d
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    healthcheck:
      # localhost だとコンテナ内で ::1 に解決されるが ClickHouse は IPv4 のみ listen するため
      # 127.0.0.1 を明示する
      test: ['CMD', 'wget', '--spider', '-q', '127.0.0.1:8123/ping']
      interval: 5s
      timeout: 3s
      retries: 10
    networks:
      - app-network
```

`volumes:` セクションに `clickhouse-data:` を追加する。

### テーブル定義

`infra/clickhouse/init/01-events.sql` を作成する。`/docker-entrypoint-initdb.d` に置くと初回起動時に実行される。

```sql
CREATE TABLE IF NOT EXISTS project_template.events
(
    event_id       UUID,
    event_name     LowCardinality(String),
    occurred_at    DateTime64(3),
    received_at    DateTime64(3),
    user_id        UInt64,
    source         LowCardinality(String),
    properties     String,
    schema_version UInt16 DEFAULT 1
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (event_name, occurred_at, user_id, event_id)
TTL toDateTime(occurred_at) + INTERVAL 2 YEAR;
```

`ORDER BY` は「特定イベントを期間で絞る」という最頻クエリに合わせている。`properties` は JSON 文字列で持ち、多用する値が固まった時点で MATERIALIZED カラムに昇格させる。

`ReplacingMergeTree` にしているのは **BullMQ が at-least-once** で同じイベントが 2 回届きうるため。`ORDER BY` 末尾の `event_id` が重複排除キーになる。集計時は `FINAL` を付けるか `argMax` で最新を取る。

### packages/data-warehouse

**技術名ではなく役割名のパッケージにする。** 将来 BigQuery 等へ移行する余地を残すため。`@repo/storage`（`Storage` interface + `createStorage` が local / S3 を分岐）と同じ流儀にそろえる。

```
packages/data-warehouse/src/
├── data-warehouse.ts              # DataWarehouse interface
├── clickhouse-data-warehouse.ts   # ClickHouse 実装
├── create-data-warehouse.ts       # factory
└── index.ts
```

```typescript
/** packages/data-warehouse/src/data-warehouse.ts */

/**
 * 分析用データウェアハウスへの書き込み抽象。
 *
 * 実装は ClickHouse / 将来の BigQuery 等を差し替えられる。
 *
 * **意図的に insertAll だけに絞っている。** クエリ・DDL・マイグレーションは
 * バックエンドごとに差が大きく（ClickHouse は database / BigQuery は dataset、
 * TTL の構文も別物、BigQuery のストリーミング挿入は部分失敗を戻り値で返す）、
 * 汎用化すると必ず漏れるため抽象化の対象外とする。
 */
export interface DataWarehouse {
  insertAll(table: string, rows: Record<string, unknown>[]): Promise<void>
  /** graceful shutdown 用 */
  close(): Promise<void>
}
```

```typescript
/** packages/data-warehouse/src/clickhouse-data-warehouse.ts */
import { createClient, type ClickHouseClient } from "@clickhouse/client"

import type { DataWarehouse } from "./data-warehouse"

export class ClickHouseDataWarehouse implements DataWarehouse {
  private readonly _client: ClickHouseClient

  constructor(config: ClickHouseConfig) {
    this._client = createClient({
      clickhouse_settings: {
        /**
         * worker が queue から取り出した分をまとめて INSERT するため、
         * ここでのバッファリングは補助的。**確定は待つ**。
         * 待たないと worker が成功扱いでジョブを完了し、
         * ClickHouse 側で失敗しても BullMQ のリトライが効かなくなる。
         */
        async_insert: 1,
        wait_for_async_insert: 1,
      },
      database: config.database,
      password: config.password,
      url: config.url,
      username: config.username,
    })
  }

  public async insertAll(table: string, rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0) return
    await this._client.insert({ format: "JSONEachRow", table, values: rows })
  }

  public async close(): Promise<void> {
    await this._client.close()
  }
}
```

```typescript
/** packages/data-warehouse/src/create-data-warehouse.ts */

/**
 * DataWarehouse の factory
 *
 * 各 app の src/index.ts で 1 回呼び、Repository に DI する。
 * BigQuery 実装を足すときは type に "bigquery" を追加して分岐を 1 つ増やす。
 */
export type DataWarehouseConfig = {
  database: string
  password: string
  type: "clickhouse"
  url: string
  username: string
}

export const createDataWarehouse = (config: DataWarehouseConfig): DataWarehouse => {
  switch (config.type) {
  case "clickhouse":
    return new ClickHouseDataWarehouse(config)
  }
}
```

**DDL は抽象化の対象外。** `events` テーブルの定義はバックエンドごとに `infra/clickhouse/init/` のような場所へ置き、パッケージには持ち込まない。

### 依存の追加

- `packages/data-warehouse` に `@clickhouse/client`
- ルート `docker-compose.yaml` の変更に伴い `docs/setup/api.md` の接続先表に ClickHouse を追記

## 動作確認

```bash
docker compose up -d clickhouse

# 起動確認
curl -s http://localhost:8124/ping   # → Ok.

# テーブルが作られているか
docker exec project-template-clickhouse \
  clickhouse-client -q "SHOW CREATE TABLE project_template.events"

# factory から接続できるか
pnpm --filter @repo/data-warehouse build
node -e '
const { createDataWarehouse } = require("./packages/data-warehouse/dist/index.js")
const dwh = createDataWarehouse({
  database: "project_template", password: "password", type: "clickhouse",
  url: "http://localhost:8124", username: "default",
})
dwh.insertAll("events", []).then(() => console.log("ok")).then(() => dwh.close())
'
```

- [ ] `curl http://localhost:8124/ping` が `Ok.` を返す
- [ ] `events` テーブルが作成されている
- [ ] `createDataWarehouse()` 経由で `insertAll` が実行できる（空配列は no-op）
- [ ] 既存の `docker compose up -d` が postgres / redis ともども問題なく起動する
