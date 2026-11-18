import type { DataWarehouse } from "@repo/data-warehouse"

import type { EventRepository, EventRow } from "../event-repository"

/**
 * `events` テーブルの定義に破壊的な変更を入れるときに上げる
 */
const SCHEMA_VERSION = 1

const EVENTS_TABLE = "events"

export class DataWarehouseEventRepository implements EventRepository {
  private readonly _dataWarehouse: DataWarehouse

  constructor(dataWarehouse: DataWarehouse) {
    this._dataWarehouse = dataWarehouse
  }

  public async insertAll(events: EventRow[]): Promise<void> {
    if (events.length === 0) return

    /**
     * `received_at` カラムは、送出側が入れた `occurred_at` カラムと比べて、書き込みまでの遅延や時計のずれを調べるために入れる
     */
    const receivedAt = this._toClickHouseDateTime(new Date())
    await this._dataWarehouse.insertAll(
      EVENTS_TABLE,
      events.map((event) => ({
        event_id: event.eventId,
        event_name: event.name,
        occurred_at: this._toClickHouseDateTime(new Date(event.occurredAt)),
        properties: JSON.stringify(event.properties),
        received_at: receivedAt,
        schema_version: SCHEMA_VERSION,
        source: event.source,
        user_id: event.userId,
      })),
    )
  }

  /**
   * DateTime64(3) が受け付ける `YYYY-MM-DD HH:mm:ss.SSS` 形式に変換する。
   * ISO 8601 の `T` と `Z` をそのまま渡すとパースに失敗する。
   */
  private _toClickHouseDateTime(date: Date): string {
    return date.toISOString().replace("T", " ").slice(0, 23)
  }
}
