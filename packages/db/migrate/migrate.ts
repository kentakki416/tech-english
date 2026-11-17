/* eslint-disable no-console */
import { cp, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { Client } from "pg"

import { buildConnectionString } from "../src/connection-string"

import { type MigrationFolder, readMigrationFolders, selectFoldersThrough } from "./migration-folders"
import { MIGRATIONS_DIR } from "./paths"
import { runDrizzleKit } from "./run-drizzle-kit"
import { runMigrations } from "./run-migrations"
import { verifyMigrationFiles } from "./verify-migration-files"

/**
 * drizzle-kit migrate は「ここまで適用する」を指定できないので、
 * そこまでのフォルダだけを写したディレクトリを見せて流す
 */
const migrateThroughFolder = async (folders: MigrationFolder[], lastFolderName: string, args: string[]): Promise<void> => {
  const partialMigrationsDir = await mkdtemp(path.join(tmpdir(), "drizzle-migrations-"))
  try {
    for (const folder of selectFoldersThrough(folders, lastFolderName)) {
      await cp(path.join(MIGRATIONS_DIR, folder.name), path.join(partialMigrationsDir, folder.name), { recursive: true })
    }
    await runDrizzleKit("migrate", args, { migrationsDir: partialMigrationsDir })
  } finally {
    await rm(partialMigrationsDir, { force: true, recursive: true })
  }
}

/**
 * db:migrate
 *
 * 1. マイグレーションのファイルを検査する（DB に触る前に止める）
 * 2. online.sql を持つ未適用のフォルダごとに、そこまでの migration.sql を適用してから online.sql を流す
 * 3. 残りの migration.sql を適用する
 */
const main = async (): Promise<void> => {
  const args = process.argv.slice(2)
  const folders = await readMigrationFolders(MIGRATIONS_DIR)
  const problems = verifyMigrationFiles(folders)
  if (problems.length > 0) {
    throw new Error(`invalid migration files:\n${problems.join("\n")}`)
  }

  if (folders.every((folder) => folder.onlineSql === undefined)) {
    await runDrizzleKit("migrate", args)
    return
  }

  const client = new Client({ connectionString: buildConnectionString() })
  await client.connect()
  try {
    const appliedFolderNames = await runMigrations(
      { query: async (sql, params) => client.query(sql, params) },
      {
        folders,
        log: (message) => console.log(`[online] ${message}`),
        migrateThrough: async (lastFolderName) =>
          lastFolderName === undefined ? runDrizzleKit("migrate", args) : migrateThroughFolder(folders, lastFolderName, args),
      },
    )
    console.log(`[online] applied ${appliedFolderNames.length} online migration(s)`)
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
