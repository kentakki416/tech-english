import type { ClickHouseClient } from "@clickhouse/client"

import { CDC_DATABASE, CDC_VIEW_VARIABLES } from "./cdc-view-variables"
import type { ViewDefinition } from "./definition-files"
import type { CdcMode } from "./env"
import { findExistingTables } from "./find-existing-tables"
import { renderViewSql } from "./render-view-sql"

type ApplyViewsParams = {
  cdcMode: Exclude<CdcMode, "none">
  views: ViewDefinition[]
}

/**
 * CDC の view を全部作り直し（CREATE OR REPLACE VIEW）、作らなかったテーブルの一覧を返す。
 *
 * view はデータを持たないため、作り直しても過去のデータは消えない。
 * ClickHouse の view の列は作成時に固定されるため、毎回作り直して Postgres 側の列の増減に追いつく。
 *
 * 元テーブルが無いとき:
 * - clickpipes: CDC の対象に足した直後で、ClickPipe の初回の取り込みが終わっていない。作らずに返す
 * - materialized_postgresql: 作り直しの後に取り込みを待っているので、無いのは異常。throw する
 *
 * client の既定の database に作る（view の SQL は database を修飾しない）。
 */
export const applyViews = async (client: ClickHouseClient, params: ApplyViewsParams): Promise<string[]> => {
  const existingTables = await findExistingTables(client, CDC_DATABASE, params.views.map((view) => view.table))
  const missingTables = params.views.map((view) => view.table).filter((table) => !existingTables.includes(table))
  if (params.cdcMode === "materialized_postgresql" && missingTables.length > 0) {
    throw new Error(`${missingTables.map((table) => `${CDC_DATABASE}.${table}`).join(", ")} does not exist`)
  }

  for (const view of params.views.filter((view) => existingTables.includes(view.table))) {
    await client.command({ query: renderViewSql(view.sql, CDC_VIEW_VARIABLES[params.cdcMode]) })
  }
  return missingTables
}

/**
 * CDC の database を読む view を全部消し、消した view の名前を返す。
 * CDC を使わない設定にした後、前に作った view が pg_cdc の無いまま残り、読むとエラーになるのを防ぐ
 *
 * client の既定の database の view だけを見る。
 */
export const dropCdcViews = async (client: ClickHouseClient): Promise<string[]> => {
  const result = await client.query({
    format: "JSONEachRow",
    query: `SELECT name FROM system.tables
      WHERE database = currentDatabase() AND engine = 'View' AND position(create_table_query, {cdcTablePrefix:String}) > 0`,
    query_params: { cdcTablePrefix: `${CDC_DATABASE}.` },
  })
  const names = (await result.json<{ name: string }>()).map((row) => row.name)
  for (const name of names) {
    await client.command({ query: `DROP VIEW IF EXISTS \`${name}\`` })
  }
  return names
}
