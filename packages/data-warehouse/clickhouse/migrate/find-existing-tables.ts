import type { ClickHouseClient } from "@clickhouse/client"

/**
 * 指定したテーブルのうち、database に存在するものの名前を返す
 */
export const findExistingTables = async (
  client: ClickHouseClient,
  database: string,
  tables: string[],
): Promise<string[]> => {
  const result = await client.query({
    format: "JSONEachRow",
    query: "SELECT name FROM system.tables WHERE database = {database:String} AND name IN {tables:Array(String)}",
    query_params: { database, tables },
  })
  const rows = await result.json<{ name: string }>()
  return rows.map((row) => row.name)
}
