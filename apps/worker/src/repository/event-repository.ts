/**
 * `@repo/queue` の `TrackEventJobItem` と同じ形だが、Repository を `@repo/queue` に依存させないため、型を別に持つ
 */
export type EventRow = {
  eventId: string
  name: string
  occurredAt: string
  properties: Record<string, number | string>
  source: string
  userId: number
}

/**
 * 引数・戻り値にデータウェアハウスの型を出さない（出すと、jobs のハンドラがデータウェアハウスの型に依存する）
 */
export interface EventRepository {
  insertAll(events: EventRow[]): Promise<void>
}
