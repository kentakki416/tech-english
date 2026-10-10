# step2-events-package

イベントの型定義と送出抽象 `@repo/events` を用意する。MVP の実装は **queue に enqueue するだけ**で、ClickHouse への書き込みは持たない。

## 対応内容

### イベント定義

```typescript
/** packages/events/src/event.ts */

/** イベントの送出元 */
export type EventSource = "admin" | "api" | "mobile" | "web"

/**
 * 記録するイベントの一覧
 *
 * 新しいイベントを足すときはここに追加する。文字列リテラルにしているのは、
 * 定義されていないイベント名をコンパイル時に弾くため。
 */
export const EVENT_NAMES = [
  "memo_created",
  "memo_deleted",
  "memo_updated",
  "memo_viewed",
] as const

export type EventName = (typeof EVENT_NAMES)[number]

/**
 * 呼び出し元が指定するイベント
 *
 * eventId / occurredAt は EventTracker の実装が埋めるので呼び出し元は書かない。
 */
export type TrackEventInput = {
  name: EventName
  properties?: Record<string, number | string>
  source: EventSource
  userId: number
}
```

### EventTracker 抽象

```typescript
/** packages/events/src/tracker.ts */
import type { TrackEventInput } from "./event"

/**
 * 行動イベントの送出抽象
 *
 * **戻り値が void なのは意図的。** 呼び出し元に送出の成否を知らせないことで、
 * 分析用のイベントがユーザーのリクエストを失敗させないようにしている。
 * 失敗は実装側で catch して logger に落とす。
 *
 * この interface を挟んでいるのは transport を差し替えられるようにするため。
 * MVP は Queue 実装だが、ログ経由へ切り替えても service 層は変更不要
 * （docs/spec/user-behavior-events/deferred-event-delivery.md）。
 */
export interface EventTracker {
  track(input: TrackEventInput): void
  trackAll(inputs: TrackEventInput[]): void
}
```

### @repo/queue に track-event を追加

既存の `process-memo` を雛形にする。

```typescript
/** packages/queue/src/jobs/track-event.ts */
export const TRACK_EVENT_QUEUE_NAME = "track-event"

/**
 * 1 ジョブで複数イベントを運ぶ。
 * フロントのバッチ送信をそのまま 1 ジョブに載せられるようにするため。
 */
export type TrackEventJobData = {
  events: {
    eventId: string
    name: string
    occurredAt: string
    properties: Record<string, number | string>
    source: string
    userId: number
  }[]
}
```

`jobs/index.ts` に re-export を追加する。`process-memo` と違い **決定的 jobId は作らない**（同じイベントを意図的に複数回送ることはなく、重複は ClickHouse 側で畳むため）。

### Queue 実装

```typescript
/** packages/events/src/queue-tracker.ts */
import { logger } from "@repo/logger"
import type { JobQueue, TrackEventJobData } from "@repo/queue"

import type { TrackEventInput } from "./event"
import type { EventTracker } from "./tracker"

/**
 * queue へ enqueue するだけの EventTracker
 *
 * enqueue を await せず、失敗しても呼び出し元に伝播させない。
 * Redis が落ちていてもユーザーのリクエストは成功させるため。
 *
 * eventId は **ここで採番する**。BullMQ は at-least-once で同じジョブが
 * 再配信されうるが、worker 側で採番すると再配信のたびに別 ID になり
 * ClickHouse の ReplacingMergeTree が重複を畳めなくなる。
 */
export class QueueEventTracker implements EventTracker {
  constructor(private readonly _queue: JobQueue<TrackEventJobData>) {}

  public track(input: TrackEventInput): void {
    this.trackAll([input])
  }

  public trackAll(inputs: TrackEventInput[]): void {
    if (inputs.length === 0) return

    const occurredAt = new Date().toISOString()
    void this._queue
      .enqueue({
        events: inputs.map((input) => ({
          eventId: crypto.randomUUID(),
          name: input.name,
          occurredAt,
          properties: input.properties ?? {},
          source: input.source,
          userId: input.userId,
        })),
      })
      .catch((err: unknown) => {
        logger.warn("failed to enqueue events", {
          count: inputs.length,
          reason: err instanceof Error ? err.message : String(err),
        })
      })
  }
}
```

### テスト用の fake

```typescript
/** packages/events/src/fake-tracker.ts */
/** テスト用。送出されたイベントを配列に貯めるだけ。Redis も ClickHouse も不要 */
export class FakeEventTracker implements EventTracker {
  public readonly inputs: TrackEventInput[] = []

  public track(input: TrackEventInput): void {
    this.inputs.push(input)
  }

  public trackAll(inputs: TrackEventInput[]): void {
    this.inputs.push(...inputs)
  }
}
```

### lint 境界の確認

`@repo/events` は `@repo/queue` / `@repo/logger` に依存するため **フロントから import させてはいけない**。`frontend-boundary` の許可リストは `@repo/api-schema` のみなので **設定変更なしで自動的に禁止される**（fail-closed）。

## 動作確認

```bash
pnpm --filter @repo/events test
```

- [ ] `trackAll()` が `enqueue` を **1 回だけ** 呼び、イベント配列をまとめて渡していること
- [ ] `eventId` が 1 件ごとに異なる UUID で採番されていること
- [ ] `enqueue` が reject しても `trackAll()` が throw しないこと（呼び出し元に伝播させない検証）
- [ ] 空配列を渡したとき `enqueue` が呼ばれないこと
- [ ] `apps/web` から `@repo/events` を import すると lint error になること（境界の確認。検証後に削除）
