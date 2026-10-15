import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { z } from "zod"

import { CDC_DATABASE } from "./cdc-view-variables"

/**
 * clickhouse-migrations は版番号を UInt32 の列に入れる。
 * 超えると JSONEachRow の insert で黙って桁あふれし、次回から「適用済みのファイルが消えた」扱いで止まる。
 */
const MAX_MIGRATION_VERSION = 4294967295

const MIGRATION_FILE_NAME_PATTERN = /^(\d+)_.+\.sql$/

/**
 * CDC の対象テーブル名。SQL（CREATE DATABASE の設定値や EXISTS TABLE）に埋め込むため、
 * 引用符が要らない識別子だけを許す。
 */
const cdcTablesSchema = z
  .array(z.string().regex(/^[a-z_][a-z0-9_]*$/, "table name must match /^[a-z_][a-z0-9_]*$/"))
  .refine((tables) => new Set(tables).size === tables.length, "table names must be unique")

/**
 * migrations/ で許す pg_cdc への参照。CDC のテーブルを消す文だけで、database が無い環境でも通る
 */
const ALLOWED_CDC_STATEMENT = new RegExp(`DROP\\s+TABLE\\s+IF\\s+EXISTS\\s+${CDC_DATABASE}\\.[A-Za-z_][A-Za-z0-9_]*`, "gi")

const CDC_REFERENCE = new RegExp(`\\b${CDC_DATABASE}\\s*\\.`, "i")

const SQL_COMMENT = /--[^\n]*|\/\*[\s\S]*?\*\//g

export type MigrationDefinition = {
  fileName: string
  sql: string
}

export type ViewDefinition = {
  sql: string
  table: string
}

/**
 * migrations/ のファイル名を検査し、問題の一覧を返す（問題が無ければ空）。
 *
 * clickhouse-migrations は形式の誤りは弾くが、同じ版番号のファイルが 2 つあっても
 * 検知せずに両方を適用してしまうため、実行前にここで止める。
 */
export const verifyMigrationFileNames = (fileNames: string[]): string[] => {
  const problems: string[] = []
  const fileNamesByVersion = new Map<number, string[]>()

  for (const fileName of [...fileNames].sort()) {
    const match = MIGRATION_FILE_NAME_PATTERN.exec(fileName)
    const version = match ? Number(match[1]) : 0
    if (version <= 0) {
      problems.push(`invalid migration file name (expected <version>_<description>.sql): ${fileName}`)
      continue
    }
    if (version > MAX_MIGRATION_VERSION) {
      problems.push(`migration version exceeds UInt32 (use sequential numbers): ${fileName}`)
      continue
    }
    fileNamesByVersion.set(version, [...(fileNamesByVersion.get(version) ?? []), fileName])
  }

  for (const [version, names] of fileNamesByVersion) {
    if (names.length > 1) {
      problems.push(`duplicate migration version ${version}: ${names.join(", ")}`)
    }
  }

  return problems
}

/**
 * CDC の対象一覧と views/ のファイルが 1 対 1 か検査し、問題の一覧を返す（問題が無ければ空）。
 */
export const verifyViewsMatchCdcTables = (cdcTables: string[], viewTables: string[]): string[] => [
  ...cdcTables
    .filter((table) => !viewTables.includes(table))
    .map((table) => `cdc table has no view (add views/${table}.sql): ${table}`),
  ...viewTables
    .filter((table) => !cdcTables.includes(table))
    .map((table) => `view has no cdc table (add it to infra/clickhouse/cdc-tables.json): ${table}`),
]

/**
 * pg_cdc を参照する migration を検査し、問題の一覧を返す（問題が無ければ空）。
 *
 * CDC の無い環境（DATA_WAREHOUSE_CDC=none）や ClickPipe の初回の取り込みの前には pg_cdc が無く、
 * 参照する migration は失敗して deploy-worker まで止まるため、実行前にここで止める。
 */
export const verifyMigrationsDoNotReferenceCdc = (migrations: MigrationDefinition[]): string[] =>
  migrations
    .filter(({ sql }) => CDC_REFERENCE.test(sql.replace(SQL_COMMENT, "").replace(ALLOWED_CDC_STATEMENT, "")))
    .map(({ fileName }) => `migration must not reference ${CDC_DATABASE} (except DROP TABLE IF EXISTS ${CDC_DATABASE}.<table>): ${fileName}`)

/**
 * cdc-tables.json の中身を検証してテーブル名の配列にする。不正なら throw する。
 */
const parseCdcTablesJson = (text: string): string[] => cdcTablesSchema.parse(JSON.parse(text))

export const readMigrationFileNames = async (dir: string): Promise<string[]> =>
  (await readdir(dir)).filter((fileName) => fileName.endsWith(".sql"))

export const readMigrationDefinitions = async (dir: string): Promise<MigrationDefinition[]> => {
  const fileNames = (await readMigrationFileNames(dir)).sort()
  return Promise.all(
    fileNames.map(async (fileName) => ({ fileName, sql: await readFile(path.join(dir, fileName), "utf8") })),
  )
}

export const readCdcTables = async (filePath: string): Promise<string[]> =>
  parseCdcTablesJson(await readFile(filePath, "utf8"))

/**
 * views/ の SQL を読む。ファイル名（拡張子を除く）が CDC の対象テーブル名になる。
 */
export const readViewDefinitions = async (dir: string): Promise<ViewDefinition[]> => {
  const fileNames = (await readdir(dir)).filter((fileName) => fileName.endsWith(".sql")).sort()
  return Promise.all(
    fileNames.map(async (fileName) => ({
      sql: await readFile(path.join(dir, fileName), "utf8"),
      table: path.basename(fileName, ".sql"),
    })),
  )
}

export const forTesting = { parseCdcTablesJson }
