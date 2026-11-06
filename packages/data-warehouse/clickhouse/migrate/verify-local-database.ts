import type { ClickHouseClient } from "@clickhouse/client"

/**
 * ローカルの ClickHouse に、migration を流す database が既にあるか確かめる。無ければ何もせずに止める。
 *
 * ローカルの ClickHouse は docker compose の CLICKHOUSE_DB で、初回の起動時にこの database を作る。
 * 無いのは同じポートで動いている別プロジェクトの ClickHouse に繋いでいる可能性が高く、そのまま流すと
 * そちらに database と events テーブルを作ってしまう。CDC を作らない既定では、pg_cdc でこの取り違えに気付けない
 */
export const verifyLocalDatabaseExists = async (client: ClickHouseClient, database: string): Promise<void> => {
  const result = await client.query({
    format: "JSONEachRow",
    query: "SELECT name FROM system.databases WHERE name = {name:String}",
    query_params: { name: database },
  })
  const rows = await result.json<{ name: string }>()
  if (rows.length === 0) {
    throw new Error(
      `database ${database} does not exist on the local ClickHouse. DATA_WAREHOUSE_URL may point to another project's ClickHouse. `
      + "The local ClickHouse creates it on first start (CLICKHOUSE_DB in docker-compose.yaml). "
      + `If you dropped it on purpose, create it yourself: CREATE DATABASE ${database}`,
    )
  }
}
