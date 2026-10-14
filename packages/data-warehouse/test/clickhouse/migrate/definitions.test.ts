import { CDC_VIEW_VARIABLES } from "../../../clickhouse/migrate/cdc-view-variables"
import {
  readCdcTables,
  readMigrationDefinitions,
  readMigrationFileNames,
  readViewDefinitions,
  verifyMigrationFileNames,
  verifyMigrationsDoNotReferenceCdc,
  verifyViewsMatchCdcTables,
} from "../../../clickhouse/migrate/definition-files"
import { renderViewSql } from "../../../clickhouse/migrate/render-view-sql"
import { CDC_TABLES_PATH, MIGRATIONS_DIR, VIEWS_DIR } from "../../../clickhouse/migrate/paths"

/**
 * リポジトリにある実際の定義ファイルを検査する。
 * migration コマンドを流す前（PR の CI）に、一覧と view のずれや版番号の重複に気づけるようにする。
 */
describe("リポジトリの定義ファイル", () => {
  it("migrations/ のファイル名に問題が無い", async () => {
    expect(verifyMigrationFileNames(await readMigrationFileNames(MIGRATIONS_DIR))).toEqual([])
  })

  it("migrations/ が pg_cdc を参照しない", async () => {
    expect(verifyMigrationsDoNotReferenceCdc(await readMigrationDefinitions(MIGRATIONS_DIR))).toEqual([])
  })

  it("cdc-tables.json と views/ が 1 対 1 になっている", async () => {
    const [cdcTables, views] = await Promise.all([readCdcTables(CDC_TABLES_PATH), readViewDefinitions(VIEWS_DIR)])

    expect(verifyViewsMatchCdcTables(cdcTables, views.map((view) => view.table))).toEqual([])
  })

  it.each(Object.keys(CDC_VIEW_VARIABLES) as (keyof typeof CDC_VIEW_VARIABLES)[])(
    "views/ の SQL が %s の変数で置き換えられる",
    async (cdcMode) => {
      const views = await readViewDefinitions(VIEWS_DIR)

      for (const view of views) {
        expect(() => renderViewSql(view.sql, CDC_VIEW_VARIABLES[cdcMode])).not.toThrow()
      }
    },
  )
})
