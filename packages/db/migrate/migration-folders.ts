import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

export const MIGRATION_FILE_NAME = "migration.sql"

export const ONLINE_FILE_NAME = "online.sql"

export type MigrationFolder = {
  migrationSql: string
  name: string
  onlineSql: string | undefined
}

const readFileIfExists = async (filePath: string): Promise<string | undefined> =>
  readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })

const readFolderNames = async (migrationsDir: string): Promise<string[]> => {
  const entries = await readdir(migrationsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/**
 * マイグレーションのフォルダを、drizzle-kit が適用するのと同じ名前順で読む
 */
export const readMigrationFolders = async (migrationsDir: string): Promise<MigrationFolder[]> => {
  const names = await readFolderNames(migrationsDir)
  return Promise.all(
    names.map(async (name) => ({
      migrationSql: await readFile(path.join(migrationsDir, name, MIGRATION_FILE_NAME), "utf8"),
      name,
      onlineSql: await readFileIfExists(path.join(migrationsDir, name, ONLINE_FILE_NAME)),
    })),
  )
}

/**
 * 名前順で lastFolderName までのフォルダを返す（フォルダ名の先頭は生成した日時なので、名前順が適用順になる）
 */
export const selectFoldersThrough = (folders: MigrationFolder[], lastFolderName: string): MigrationFolder[] =>
  folders.filter((folder) => folder.name <= lastFolderName)
