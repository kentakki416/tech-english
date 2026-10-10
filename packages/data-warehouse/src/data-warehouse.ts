/**
 * 分析用データウェアハウスへの書き込み抽象。
 *
 * 実装は ClickHouse / 将来の ClickHouse Cloud / Tinybird 等を差し替えられる。
 *
 * **意図的に insertAll と close だけに絞っている。** クエリ・DDL・マイグレーションは
 * バックエンドごとに差が大きく（ClickHouse は database / BigQuery は dataset、
 * TTL の構文も別物）、汎用化すると必ず漏れるため抽象化の対象外とする。
 *
 * 詳細は docs/spec/user-behavior-events/deferred-event-delivery.md を参照。
 */
export interface DataWarehouse {
  /**
   * 行をまとめて挿入する。空配列のときは何もしない。
   */
  insertAll(table: string, rows: Record<string, unknown>[]): Promise<void>
  /**
   * 接続を閉じる。graceful shutdown から呼ぶ。
   */
  close(): Promise<void>
}
