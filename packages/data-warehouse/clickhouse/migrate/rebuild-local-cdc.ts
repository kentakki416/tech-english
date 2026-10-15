import { setTimeout as sleep } from "node:timers/promises"

import type { ClickHouseClient } from "@clickhouse/client"

import { CDC_DATABASE } from "./cdc-view-variables"
import { findExistingTables } from "./find-existing-tables"
import { isLocalCdcDatabaseOf } from "./local-cdc-database"

type LocalCdcParams = {
  postgres: {
    database: string
    host: string
    password: string
    user: string
  }
  tables: string[]
  timeoutMs: number
}

/**
 * ローカルの CDC（MaterializedPostgreSQL）を作り直し、全テーブルの取り込みを待つ。
 *
 * MaterializedPostgreSQL は Postgres 側で列が変わるとそのテーブルの同期を止める。
 * テーブル単位の DETACH PERMANENTLY → ATTACH では、ClickHouse 24.10 で付け直した後の変更が
 * 反映されなかったため、database ごと作り直す。replication slot と publication も
 * DROP DATABASE で消え、CREATE DATABASE で作り直される。ローカルのデータは少ないので
 * 毎回の全件取り込みは数秒で終わる。
 */
export const rebuildLocalCdc = async (client: ClickHouseClient, params: LocalCdcParams): Promise<void> => {
  const { database, host, password, user } = params.postgres
  /**
   * 文字列リテラルに埋め込むため、閉じ引用符とエスケープになる文字を拒否する
   */
  if ([database, host, password, user].some((value) => /['\\]/.test(value))) {
    throw new Error("LOCAL_CDC_POSTGRES_* must not contain a single quote or a backslash")
  }

  await verifyExistingCdcDatabaseIsOwn(client, params.postgres)
  await client.command({ query: `DROP DATABASE IF EXISTS ${CDC_DATABASE} SYNC` })
  /**
   * 対象が空のまま作ると、MaterializedPostgreSQL は DB の全テーブルを取り込んでしまう
   */
  if (params.tables.length === 0) return

  await client.command({
    query: `CREATE DATABASE ${CDC_DATABASE}
      ENGINE = MaterializedPostgreSQL('${host}', '${database}', '${user}', '${password}')
      SETTINGS materialized_postgresql_tables_list = '${params.tables.join(",")}'`,
  })
  await waitForCdcTables(client, params.tables, params.timeoutMs)
}

/**
 * 既にある pg_cdc が、このプロジェクトの Postgres を取り込むものか確かめる。違えば消さずに止める。
 */
const verifyExistingCdcDatabaseIsOwn = async (
  client: ClickHouseClient,
  postgres: LocalCdcParams["postgres"],
): Promise<void> => {
  const result = await client.query({
    format: "JSONEachRow",
    query: "SELECT engine_full FROM system.databases WHERE name = {name:String}",
    query_params: { name: CDC_DATABASE },
  })
  const rows = await result.json<{ engine_full: string }>()
  const engineFull = rows[0]?.engine_full
  if (engineFull !== undefined && !isLocalCdcDatabaseOf(engineFull, postgres)) {
    throw new Error(
      `refusing to drop ${CDC_DATABASE}: it does not replicate ${postgres.host}/${postgres.database} (${engineFull}). `
      + "DATA_WAREHOUSE_URL may point to another project's ClickHouse. "
      + `If you changed LOCAL_CDC_POSTGRES_* on purpose, drop it yourself: DROP DATABASE ${CDC_DATABASE}`,
    )
  }
}

/**
 * CREATE DATABASE は即座に返り、テーブルは非同期にアタッチされるため、全テーブルが現れるまで待つ。
 */
const waitForCdcTables = async (client: ClickHouseClient, tables: string[], timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const existingTables = await findExistingTables(client, CDC_DATABASE, tables)
    const missingTables = tables.filter((table) => !existingTables.includes(table))
    if (missingTables.length === 0) return
    if (Date.now() >= deadline) {
      throw new Error(
        `${CDC_DATABASE} tables were not attached within ${timeoutMs / 1000}s: ${missingTables.join(", ")}. `
        + "The tables may not exist in Postgres (run `pnpm --filter api db:migrate` first), "
        + "or Postgres may reject the connection, or the tables may lack a primary key.",
      )
    }
    await sleep(1000)
  }
}
