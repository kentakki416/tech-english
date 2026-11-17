import { parseOnlineSql } from "../../../migrate/online-statement"
import type { SqlExecutor } from "../../../migrate/run-migrations"

type FakeState = {
  appliedFolderNames?: string[]
  /**
   * 別のセッションが作成中の index（引用符付きの名前。例: "public"."items_owner_id_idx"）
   */
  buildingIndexNames?: string[]
  /**
   * CREATE INDEX を失敗させる index。失敗すると、実物と同じく無効な index が残る
   */
  failingIndexKeys?: string[]
  /**
   * DB にある index。値は有効かどうか
   */
  indexes?: Record<string, boolean>
}

const buildIndexKey = (schema: string, indexName: string): string => `${schema}.${indexName}`

/**
 * オンライン操作の実行部が使う SQL にだけ答える executor の偽物。実行した SQL を記録する
 */
export const createFakeSqlExecutor = (state: FakeState = {}) => {
  const appliedFolderNames = new Set(state.appliedFolderNames ?? [])
  const indexes = new Map(Object.entries(state.indexes ?? {}))
  const queries: string[] = []

  const executor: SqlExecutor = {
    query: async (sql, params = []) => {
      queries.push(sql)
      if (sql.includes("pg_stat_progress_create_index")) {
        return { rows: state.buildingIndexNames?.includes(String(params[0])) ? [{}] : [] }
      }
      if (sql.includes("pg_catalog.pg_index")) {
        const valid = indexes.get(buildIndexKey(String(params[0]), String(params[1])))
        return { rows: valid === undefined ? [] : [{ valid }] }
      }
      if (sql.startsWith("SELECT \"name\"")) {
        return { rows: [...appliedFolderNames].map((name) => ({ name })) }
      }
      if (sql.startsWith("INSERT INTO")) {
        appliedFolderNames.add(String(params[0]))
        return { rows: [] }
      }
      if (/^(CREATE|DROP) (UNIQUE )?INDEX/.test(sql)) {
        const [statement] = parseOnlineSql(sql)
        const indexKey = buildIndexKey(statement.schema, statement.indexName)
        if (statement.kind === "dropIndex") {
          indexes.delete(indexKey)
        } else if (state.failingIndexKeys?.includes(indexKey)) {
          indexes.set(indexKey, false)
          throw new Error(`could not create unique index "${statement.indexName}"`)
        } else if (!indexes.has(indexKey)) {
          indexes.set(indexKey, true)
        }
      }
      return { rows: [] }
    },
  }

  return {
    appliedFolderNames,
    executor,
    indexes,
    /**
     * index を作る・消す文だけを、実行した順に返す
     */
    indexStatements: () => queries.filter((sql) => /^(CREATE|DROP) (UNIQUE )?INDEX/.test(sql)),
  }
}
