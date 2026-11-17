import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { readMigrationFolders, selectFoldersThrough } from "../../migrate/migration-folders"

let migrationsDir: string

const writeFolder = async (name: string, files: Record<string, string>): Promise<void> => {
  await mkdir(path.join(migrationsDir, name))
  for (const [fileName, content] of Object.entries(files)) {
    await writeFile(path.join(migrationsDir, name, fileName), content)
  }
}

beforeEach(async () => {
  migrationsDir = await mkdtemp(path.join(tmpdir(), "migration-folders-"))
})

afterEach(async () => {
  await rm(migrationsDir, { force: true, recursive: true })
})

describe("readMigrationFolders", () => {
  describe("正常系", () => {
    it("フォルダを名前順に読み、online.sql が無ければ undefined にする", async () => {
      await writeFolder("20260103000000_last", { "migration.sql": "SELECT 3;" })
      await writeFolder("20260101000000_init", { "migration.sql": "SELECT 1;" })
      await writeFolder("20260102000000_add", { "migration.sql": "SELECT 2;", "online.sql": "DROP INDEX CONCURRENTLY IF EXISTS \"a_idx\";\n" })
      await writeFile(path.join(migrationsDir, "README.md"), "フォルダではないので読まない")

      expect(await readMigrationFolders(migrationsDir)).toEqual([
        { migrationSql: "SELECT 1;", name: "20260101000000_init", onlineSql: undefined },
        { migrationSql: "SELECT 2;", name: "20260102000000_add", onlineSql: "DROP INDEX CONCURRENTLY IF EXISTS \"a_idx\";\n" },
        { migrationSql: "SELECT 3;", name: "20260103000000_last", onlineSql: undefined },
      ])
    })
  })

  describe("異常系", () => {
    it("migration.sql の無いフォルダがあれば throw する", async () => {
      await writeFolder("20260101000000_init", { "online.sql": "" })

      await expect(readMigrationFolders(migrationsDir)).rejects.toThrow("migration.sql")
    })
  })
})

describe("selectFoldersThrough", () => {
  const folders = ["20260101000000_init", "20260102000000_add", "20260103000000_last"].map((name) => ({
    migrationSql: "SELECT 1;",
    name,
    onlineSql: undefined,
  }))

  describe("正常系", () => {
    it("指定したフォルダまで（そのフォルダを含む）を返す", () => {
      expect(selectFoldersThrough(folders, "20260102000000_add").map((folder) => folder.name)).toEqual([
        "20260101000000_init",
        "20260102000000_add",
      ])
    })

    it("最後のフォルダを指定したら、すべて返す", () => {
      expect(selectFoldersThrough(folders, "20260103000000_last")).toEqual(folders)
    })
  })
})
