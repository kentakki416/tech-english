import type { MigrationFolder } from "./migration-folders"
import { type OnlineStatement, parseOnlineSql, quoteIdentifier } from "./online-statement"

const HISTORY_TABLE = "\"drizzle\".\"__online_migrations\""

export type SqlExecutor = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

type RunMigrationsParams = {
  folders: MigrationFolder[]
  log: (message: string) => void
  /**
   * 指定したフォルダまで（省略したら全フォルダ）の、未適用の migration.sql を適用する
   */
  migrateThrough: (lastFolderName?: string) => Promise<void>
}

const createHistoryTable = async (executor: SqlExecutor): Promise<void> => {
  await executor.query("CREATE SCHEMA IF NOT EXISTS \"drizzle\"")
  await executor.query(
    `CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} ("name" text PRIMARY KEY, "applied_at" timestamptz NOT NULL DEFAULT now())`,
  )
}

const findAppliedFolderNames = async (executor: SqlExecutor): Promise<Set<string>> => {
  const { rows } = await executor.query(`SELECT "name" FROM ${HISTORY_TABLE}`)
  return new Set(rows.map((row) => String(row.name)))
}

/**
 * index があれば有効かどうかを返す。無ければ undefined
 */
const findIndexValidity = async (executor: SqlExecutor, statement: OnlineStatement): Promise<boolean | undefined> => {
  const { rows } = await executor.query(
    `SELECT index_state.indisvalid AS valid
     FROM pg_catalog.pg_index AS index_state
     JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_state.indexrelid
     JOIN pg_catalog.pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace
     WHERE index_namespace.nspname = $1 AND index_class.relname = $2`,
    [statement.schema, statement.indexName],
  )
  return rows.length > 0 ? rows[0].valid === true : undefined
}

const isIndexBeingBuilt = async (executor: SqlExecutor, qualifiedName: string): Promise<boolean> => {
  const { rows } = await executor.query(
    "SELECT 1 FROM pg_catalog.pg_stat_progress_create_index WHERE index_relid = pg_catalog.to_regclass($1)",
    [qualifiedName],
  )
  return rows.length > 0
}

const createIndex = async (executor: SqlExecutor, statement: OnlineStatement, log: (message: string) => void): Promise<void> => {
  const qualifiedName = `${quoteIdentifier(statement.schema)}.${quoteIdentifier(statement.indexName)}`
  /**
   * CREATE INDEX CONCURRENTLY が途中で失敗すると無効な index が残り、IF NOT EXISTS はそれを「ある」とみなして何もしない
   */
  if (await findIndexValidity(executor, statement) === false) {
    /**
     * 作成中の index も無効として見える。別の db:migrate が作成中なら、消さずに止める
     */
    if (await isIndexBeingBuilt(executor, qualifiedName)) {
      throw new Error(`index ${qualifiedName} is being built by another session. Run db:migrate again after it finishes`)
    }
    log(`dropping invalid index ${qualifiedName} left by a failed build`)
    await executor.query(`DROP INDEX CONCURRENTLY IF EXISTS ${qualifiedName}`)
  }
  await executor.query(statement.sql)
  if (await findIndexValidity(executor, statement) !== true) {
    throw new Error(`index ${qualifiedName} is not valid after: ${statement.sql}`)
  }
}

/**
 * マイグレーションを、フォルダの名前順に適用する。
 *
 * online.sql を持つ未適用のフォルダごとに、そこまでの migration.sql を適用してから、
 * そのフォルダの online.sql をトランザクションの外で 1 文ずつ流す。
 * online.sql を、書かれた時点のスキーマに対して流すため（先の migration.sql まで適用してから流すと、
 * カラムの rename などでスキーマが変わっていて失敗する）。
 *
 * フォルダの全文が成功したら履歴に記録する。途中で失敗したフォルダは記録されず、次の実行で先頭から流し直す
 * （どの文も何度流しても同じ結果になる）。online.sql を適用したフォルダの名前を返す。
 */
export const runMigrations = async (executor: SqlExecutor, params: RunMigrationsParams): Promise<string[]> => {
  await createHistoryTable(executor)
  const appliedFolderNames = await findAppliedFolderNames(executor)

  const newlyAppliedFolderNames: string[] = []
  for (const folder of params.folders) {
    if (folder.onlineSql === undefined || appliedFolderNames.has(folder.name)) continue

    await params.migrateThrough(folder.name)
    for (const statement of parseOnlineSql(folder.onlineSql)) {
      params.log(`running: ${statement.sql}`)
      if (statement.kind === "createIndex") {
        await createIndex(executor, statement, params.log)
      } else {
        await executor.query(statement.sql)
      }
    }
    await executor.query(`INSERT INTO ${HISTORY_TABLE} ("name") VALUES ($1) ON CONFLICT ("name") DO NOTHING`, [folder.name])
    newlyAppliedFolderNames.push(folder.name)
  }

  await params.migrateThrough()
  return newlyAppliedFolderNames
}
