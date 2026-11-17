import type { MigrationFolder } from "./migration-folders"
import { parseOnlineSql, splitSqlStatements } from "./online-statement"

/**
 * 文の先頭だけを見る（INSERT する文字列の中の「INDEX CONCURRENTLY」を、index の操作と取り違えない）
 */
const CONCURRENTLY_PATTERN = /^(?:CREATE\s+(?:UNIQUE\s+)?INDEX|DROP\s+INDEX|REINDEX\b[^;]*?)\s+CONCURRENTLY\b/i

/**
 * DB に触る前に、マイグレーションのファイルを検査して問題の一覧を返す（問題が無ければ空）
 */
export const verifyMigrationFiles = (folders: MigrationFolder[]): string[] => {
  const problems: string[] = []
  for (const folder of folders) {
    if (splitSqlStatements(folder.migrationSql).some((statement) => CONCURRENTLY_PATTERN.test(statement))) {
      problems.push(
        `${folder.name}/migration.sql has an INDEX CONCURRENTLY statement, which cannot run inside a transaction. Run db:generate to move it to online.sql`,
      )
    }
    if (folder.onlineSql === undefined) continue
    try {
      parseOnlineSql(folder.onlineSql)
    } catch (error) {
      problems.push(`${folder.name}/online.sql: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return problems
}
