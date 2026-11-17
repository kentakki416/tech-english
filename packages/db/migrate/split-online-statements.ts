import { writeFile } from "node:fs/promises"
import path from "node:path"

import { MIGRATION_FILE_NAME, ONLINE_FILE_NAME, readMigrationFolders } from "./migration-folders"

const STATEMENT_BREAKPOINT = "--> statement-breakpoint"

const MOVED_NOTICE = "-- このマイグレーションの文は、トランザクションの外で流す online.sql に移した\n"

const CREATE_INDEX_CONCURRENTLY_PATTERN = /^(CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+)(?!IF\s+NOT\s+EXISTS\s)/i

const CREATE_INDEX_CONCURRENTLY_IF_NOT_EXISTS_PATTERN = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s/i

type SplitResult = {
  migrationSql: string
  onlineStatements: string[]
}

const terminateStatement = (statement: string): string => (statement.endsWith(";") ? statement : `${statement};`)

const convertToOnlineStatement = (statement: string): string | undefined => {
  if (CREATE_INDEX_CONCURRENTLY_IF_NOT_EXISTS_PATTERN.test(statement)) return terminateStatement(statement)
  if (CREATE_INDEX_CONCURRENTLY_PATTERN.test(statement)) {
    return terminateStatement(statement.replace(CREATE_INDEX_CONCURRENTLY_PATTERN, "$1IF NOT EXISTS "))
  }
  return undefined
}

/**
 * drizzle-kit が生成した migration.sql から、CREATE INDEX CONCURRENTLY を取り出す（IF NOT EXISTS を付ける）
 */
const splitOnlineStatements = (migrationSql: string): SplitResult => {
  const keptStatements: string[] = []
  const onlineStatements: string[] = []
  for (const chunk of migrationSql.split(STATEMENT_BREAKPOINT)) {
    const statement = chunk.trim()
    if (statement.length === 0) continue
    const onlineStatement = convertToOnlineStatement(statement)
    if (onlineStatement) {
      onlineStatements.push(onlineStatement)
    } else {
      keptStatements.push(statement)
    }
  }
  /**
   * 取り出す文が無いファイルは 1 文字も変えない（適用済みのマイグレーションを、空白の違いだけで書き換えない）
   */
  if (onlineStatements.length === 0) return { migrationSql, onlineStatements }

  return {
    migrationSql: keptStatements.length > 0 ? `${keptStatements.join(`${STATEMENT_BREAKPOINT}\n`)}\n` : MOVED_NOTICE,
    onlineStatements,
  }
}

/**
 * すべてのフォルダの migration.sql を見て、取り出す文があれば online.sql に書き足す。
 * 取り出した後の migration.sql には取り出す文が残らないので、何度実行しても同じ結果になる。
 */
export const moveOnlineStatements = async (migrationsDir: string): Promise<string[]> => {
  const changedFolderNames: string[] = []
  for (const folder of await readMigrationFolders(migrationsDir)) {
    const { migrationSql, onlineStatements } = splitOnlineStatements(folder.migrationSql)
    if (onlineStatements.length === 0) continue
    /**
     * online.sql を先に書く。途中で失敗しても、取り出した文がどちらかのファイルに残る
     */
    await writeFile(path.join(migrationsDir, folder.name, ONLINE_FILE_NAME), `${folder.onlineSql ?? ""}${onlineStatements.join("\n")}\n`)
    await writeFile(path.join(migrationsDir, folder.name, MIGRATION_FILE_NAME), migrationSql)
    changedFolderNames.push(folder.name)
  }
  return changedFolderNames
}

export const forTesting = { splitOnlineStatements }
