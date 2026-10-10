/**
 * イベントの送出元
 *
 * クライアントの自己申告ではなく server 側で判定した値を入れる。
 */
export type EventSource = "admin" | "api" | "mobile" | "web"

/**
 * 記録するイベントの一覧
 *
 * 新しいイベントを足すときはここに追加する。文字列リテラルの union にしているのは、
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
