export const TRACK_EVENT_QUEUE_NAME = "track-event"

/**
 * 1 ジョブで複数イベントを運ぶ。
 * フロントのバッチ送信（POST /api/events）をそのまま 1 ジョブに載せられるようにするため。
 */
export type TrackEventJobData = {
  events: TrackEventJobItem[]
}

export type TrackEventJobItem = {
  /**
   * enqueue 側で採番する。BullMQ は at-least-once で再配信されうるが、
   * worker 側で採番すると再配信のたびに別 ID になり、ClickHouse の
   * ReplacingMergeTree が重複を畳めなくなる。
   */
  eventId: string
  name: string
  occurredAt: string
  properties: Record<string, number | string>
  source: string
  userId: number
}
