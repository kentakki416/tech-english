/**
 * クライアントの自己申告ではなく、server 側で判定した値を入れる
 */
export type EventSource = "admin" | "api" | "mobile" | "web"

export const EVENT_NAMES = [
  "memo_created",
  "memo_deleted",
  "memo_updated",
  "memo_viewed",
] as const

/**
 * `string` にせず union にしているのは、EVENT_NAMES に無いイベント名をコンパイル時に弾くため
 */
export type EventName = (typeof EVENT_NAMES)[number]

/**
 * eventId / occurredAt は EventTracker の実装が入れるので、ここには持たない
 */
export type TrackEventInput = {
  name: EventName
  properties?: Record<string, number | string>
  source: EventSource
  userId: number
}
