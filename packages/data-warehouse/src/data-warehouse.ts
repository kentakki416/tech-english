/**
 * 分析用データウェアハウスへの書き込み抽象。
 *
 * **意図的に insertAll と close だけに絞っている。** クエリ・DDL・マイグレーションは
 * バックエンドごとに差が大きく（ClickHouse は database / BigQuery は dataset、
 * TTL の構文も別物）、汎用化すると必ず漏れるため抽象化の対象外とする。
 */
export interface DataWarehouse {
  /**
   * 空配列のときは何もしない。
   */
  insertAll(table: string, rows: Record<string, unknown>[]): Promise<void>
  close(): Promise<void>
}
