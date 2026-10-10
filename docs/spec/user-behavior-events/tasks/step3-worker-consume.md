# step3-worker-consume

`apps/worker` に `track-event` ジョブのハンドラを追加し、ClickHouse へ書き込む。

## 対応内容

### Repository

`apps/worker/CLAUDE.md` のルールどおり、**interface の引数・戻り値に ClickHouse の型を出さない**。

```typescript
/** apps/worker/src/repository/event-repository.ts */

/** ClickHouse に書き込む 1 件のイベント */
export type EventRow = {
  eventId: string
  name: string
  occurredAt: string
  properties: Record<string, number | string>
  source: string
  userId: number
}

export interface EventRepository {
  insertAll(events: EventRow[]): Promise<void>
}
```

実装 `src/repository/data-warehouse/event-repository.ts` が `@repo/data-warehouse` の `DataWarehouse` を受け取り、`received_at` と `schema_version` を付与して `insertAll("events", rows)` する。

```typescript
/** apps/worker/src/repository/data-warehouse/event-repository.ts */
import type { DataWarehouse } from "@repo/data-warehouse"

import type { EventRepository, EventRow } from "../event-repository"

const SCHEMA_VERSION = 1

export class DataWarehouseEventRepository implements EventRepository {
  constructor(private readonly _dwh: DataWarehouse) {}

  public async insertAll(events: EventRow[]): Promise<void> {
    const receivedAt = new Date().toISOString()
    await this._dwh.insertAll("events", events.map((e) => ({
      event_id: e.eventId,
      event_name: e.name,
      occurred_at: e.occurredAt,
      properties: JSON.stringify(e.properties),
      received_at: receivedAt,
      schema_version: SCHEMA_VERSION,
      source: e.source,
      user_id: e.userId,
    })))
  }
}
```

**ClickHouse という語はここにも出てこない。** どのバックエンドを使うかは `src/index.ts` の `createDataWarehouse()` の config だけが決める。

### ジョブハンドラ

`apps/worker/CLAUDE.md` の流儀に従い **純粋関数の factory** にする。BullMQ の型は import しない。

```typescript
/** apps/worker/src/jobs/track-event.ts */
import { logger } from "@repo/logger"
import type { JobProcessor, TrackEventJobData } from "@repo/queue"

import type { EventRepository } from "../repository"

export type TrackEventDeps = {
  eventRepository: EventRepository
}

/**
 * `track-event` ジョブハンドラ
 *
 * 1 ジョブに複数イベントが入っているので、まとめて 1 回の INSERT にする。
 * ClickHouse は小さな INSERT を大量に受けるとマージ負荷で劣化するため。
 *
 * 冪等性: eventId は enqueue 側で採番済みなので、再配信されても
 * ClickHouse の ReplacingMergeTree が同じ event_id を 1 件に畳む。
 */
export const trackEvent = (deps: TrackEventDeps): JobProcessor<TrackEventJobData> =>
  async (message) => {
    const { events } = message.data
    if (events.length === 0) return

    await deps.eventRepository.insertAll(events)

    logger.debug("track-event: inserted", {
      count: events.length,
      jobId: message.id,
    })
  }
```

**ここでは `await` する**（送出側と違って fire-and-forget にしない）。失敗を握りつぶすと BullMQ がジョブを成功扱いにし、リトライが効かなくなる。

### 結線と DI

- `src/workers/track-event-worker.ts` で `startBullMQWorker` と結線する
- `src/index.ts` で `createDataWarehouse({ type: "clickhouse", ... })` を 1 回呼び、Repository → ハンドラ → worker の順に組み立てて `consumers` に追加する
- `src/runtime/graceful-shutdown.ts` の `ShutdownDeps` に `DataWarehouse` を足し、`close()` を呼ぶ

### env

`apps/worker/src/env.ts` に `DATA_WAREHOUSE_URL` / `DATA_WAREHOUSE_DATABASE` / `DATA_WAREHOUSE_USER` / `DATA_WAREHOUSE_PASSWORD` を追加する（`NODE_ENV !== "test"` で URL は必須）。**env 名にも技術名を入れない**ことで、バックエンドを変えても env を書き換えずに済む。`apps/worker/CLAUDE.md` の環境変数表にも追記する。

## 動作確認

```bash
pnpm --filter worker test
```

- [ ] イベント 3 件のジョブで `EventRepository.insertAll` が **1 回だけ** 3 件まとめて呼ばれること
- [ ] `DataWarehouseEventRepository` が `received_at` / `schema_version` を付与し、`insertAll("events", ...)` を 1 回だけ呼ぶこと（fake の `DataWarehouse` で検証）
- [ ] 空配列なら `insertAll` が呼ばれないこと
- [ ] `insertAll` が throw したら **そのまま伝播すること**（BullMQ にリトライさせるため握りつぶさない）
- [ ] 同じ `eventId` のジョブを 2 回処理しても ClickHouse 上で 1 件になること（`SELECT count() FROM events FINAL WHERE event_id = ...`）

ローカルでの E2E 確認:

```bash
docker compose up -d clickhouse redis
pnpm dev   # api と worker が同時に起動する
```

- [ ] メモを削除すると数秒以内に ClickHouse に `memo_deleted` が入ること
- [ ] **ClickHouse を落とした状態でメモを削除しても削除は成功**し、ClickHouse を戻すと BullMQ のリトライでイベントが届くこと
