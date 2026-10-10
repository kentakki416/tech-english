/**
 * `track-event` Queue: ユーザー行動イベントを ClickHouse へ書き込む job。
 *
 * Producer (apps/api) は `@repo/events` の QueueEventTracker 経由で enqueue する。
 * Consumer (apps/worker) は `JobProcessor<TrackEventJobData>` を実装する。
 *
 * 設計: docs/spec/user-behavior-events/README.md
 */
export const TRACK_EVENT_QUEUE_NAME = "track-event"

/**
 * 1 ジョブで複数イベントを運ぶ。
 * フロントのバッチ送信（POST /api/events）をそのまま 1 ジョブに載せられるようにするため。
 *
 * eventId は **enqueue 側で採番する**。BullMQ は at-least-once で再配信されうるが、
 * worker 側で採番すると再配信のたびに別 ID になり、ClickHouse の
 * ReplacingMergeTree が重複を畳めなくなる。
 */
export type TrackEventJobData = {
  events: TrackEventJobItem[]
}

export type TrackEventJobItem = {
  eventId: string
  name: string
  occurredAt: string
  properties: Record<string, number | string>
  source: string
  userId: number
}
