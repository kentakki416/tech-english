# step2-api-event-tracker-type

api の行動イベントの送出先を `EVENT_TRACKER_TYPE` で選べるようにする。`queue`（既定値。現在の挙動）は Queue に enqueue し、`none` はイベントを捨てる。worker を作らない minimal 環境で、処理されないジョブが Redis（Upstash）に溜まり続けるのを防ぐため。既定値は現在の挙動なので、prd / dev の挙動は変わらない。

設計: [`../README.md`](../README.md#worker-を作るかどうかの切り替え)

前提: [step1-api-event-flush-and-lwa](./step1-api-event-flush-and-lwa.md)（`EventTracker.flush()` を実装する）

## 対応内容

### `NoopEventTracker`（`packages/events`）

```typescript
/** packages/events/src/noop-tracker.ts */
import type { EventTracker } from "./tracker"

/**
 * イベントを捨てる EventTracker
 *
 * worker を動かさない環境（minimal 構成で worker を作らない場合）で使う。Queue に入れても
 * 処理する worker がいないため、ジョブが Redis に溜まり続けるのを防ぐ。
 * worker の DATA_WAREHOUSE_TYPE=none と同じく、記録しないことを env で明示的に選んだときだけ使う。
 */
export class NoopEventTracker implements EventTracker {
  public async flush(): Promise<void> {
    /** 送出しないので、待つものは無い */
  }

  public track(): void {
    /** 捨てる */
  }

  public trackAll(): void {
    /** 捨てる */
  }
}
```

バレル（`src/index.ts`）に足す（ファイル名順）。

```typescript
export { FakeEventTracker } from "./fake-tracker"

export { NoopEventTracker } from "./noop-tracker"

export { QueueEventTracker } from "./queue-tracker"
```

### env（`apps/api/src/env.ts`）

キーはアルファベット順の位置に置く。

```typescript
  /**
   * 行動イベントの送出先。queue は Queue に enqueue し、apps/worker が ClickHouse に書き込む。
   * none はイベントを捨てる（worker を動かさない環境で使う。minimal 構成で worker を作らない場合）。
   * 既定値の queue は prd / dev の現在の挙動。
   */
  EVENT_TRACKER_TYPE: z.enum(["none", "queue"]).default("queue"),
```

### DI（`src/index.ts`）

```typescript
import { type EventTracker, NoopEventTracker, QueueEventTracker } from "@repo/events"

/**
 * 行動イベントの送出先は EVENT_TRACKER_TYPE で選ぶ。
 * queue なら enqueue するだけで、ClickHouse への書き込みは apps/worker が行う
 */
const eventTracker: EventTracker = env.EVENT_TRACKER_TYPE === "queue"
  ? new QueueEventTracker(new BullMQJobQueue(redis, TRACK_EVENT_QUEUE_NAME))
  : new NoopEventTracker()
```

`none` のときは `POST /api/events`（クライアントからのイベント送信）も成功を返してイベントを捨てる。レスポンスは変えない（クライアントに環境の違いを意識させないため）。

## 動作確認

```bash
pnpm --filter @repo/events test
pnpm --filter api test
```

### テスト

`packages/events`（`test/noop-tracker.test.ts`）:

- [ ] `track` / `trackAll` は例外を投げない
- [ ] `flush()` はすぐ resolve する

`apps/api`:

- [ ] 既存のテストがそのまま通る（DI の既定値は `queue` のまま）

### `none` での起動

```bash
EVENT_TRACKER_TYPE=none pnpm --filter api dev
```

- [ ] dev-login → メモ作成が成功し、Redis に `bull:track-event:*` のキーが増えない（`redis-cli -p 6380 --scan --pattern 'bull:track-event:*'`）
- [ ] `POST /api/events` が従来と同じステータスを返す
- [ ] env を付けずに起動すると、従来どおり enqueue され、worker が `track-event` を処理する
