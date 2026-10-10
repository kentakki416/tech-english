/**
 * データウェアハウスに書き込む 1 件のイベント。
 *
 * `@repo/queue` の `TrackEventJobItem` と同形だが、Queue 実装に依存しないよう
 * worker 側で型を持つ。
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
 * 行動イベントの書き込みリポジトリ
 *
 * **引数・戻り値にデータウェアハウスの型を出さない。** どのバックエンドを使うかは
 * `src/index.ts` の `createDataWarehouse()` だけが決める。
 */
export interface EventRepository {
  insertAll(events: EventRow[]): Promise<void>
}
