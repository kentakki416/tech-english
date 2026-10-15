import { ClickHouseDataWarehouse, type ClickHouseConfig } from "./clickhouse/clickhouse-data-warehouse"
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

export const createDataWarehouse = (config: DataWarehouseConfig): DataWarehouse => {
  switch (config.type) {
  case "clickhouse":
    return new ClickHouseDataWarehouse(config)
  case "none":
    return new NoopDataWarehouse()
  }
}
