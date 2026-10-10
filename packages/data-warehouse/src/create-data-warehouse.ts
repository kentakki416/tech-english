import { ClickHouseDataWarehouse, type ClickHouseConfig } from "./clickhouse-data-warehouse"
import type { DataWarehouse } from "./data-warehouse"
import { NoopDataWarehouse } from "./noop-data-warehouse"

/**
 * factory に渡す設定。
 *
 * `type` で判別する union にしているのは、`none` のときに接続情報を
 * 要求されないようにするため（union にしないと url 等が必須のまま残る）。
 */
export type DataWarehouseConfig =
  | ({ type: "clickhouse" } & ClickHouseConfig)
  | { type: "none" }

/**
 * DataWarehouse の factory
 *
 * 各 app の src/index.ts で 1 回呼び、Repository に DI する。
 * 別バックエンドを足すときは type を追加して分岐を 1 つ増やす。
 */
export const createDataWarehouse = (config: DataWarehouseConfig): DataWarehouse => {
  switch (config.type) {
  case "clickhouse":
    return new ClickHouseDataWarehouse(config)
  case "none":
    return new NoopDataWarehouse()
  }
}
