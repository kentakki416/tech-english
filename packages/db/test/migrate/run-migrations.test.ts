import type { MigrationFolder } from "../../migrate/migration-folders"
import { runMigrations } from "../../migrate/run-migrations"

import { createFakeSqlExecutor } from "./support/fake-sql-executor"

const CREATE_OWNER_INDEX = "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"items_owner_id_idx\" ON \"items\" (\"owner_id\")"
const CREATE_NAME_INDEX = "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS \"items_name_key\" ON \"items\" (\"name\")"
const DROP_OWNER_INDEX = "DROP INDEX CONCURRENTLY IF EXISTS \"items_owner_id_idx\""
const OWNER_INDEX_KEY = "public.items_owner_id_idx"

const buildFolder = (name: string, onlineStatements?: string[]): MigrationFolder => ({
  migrationSql: "SELECT 1;",
  name,
  onlineSql: onlineStatements ? `${onlineStatements.join(";\n")};\n` : undefined,
})

/**
 * migration.sql の適用と index の文を、実行した順に steps に記録して流す
 */
const run = async (fake: ReturnType<typeof createFakeSqlExecutor>, folders: MigrationFolder[]) => {
  const steps: string[] = []
  const executor = {
    query: async (sql: string, params?: unknown[]) => {
      if (/^(CREATE|DROP) (UNIQUE )?INDEX/.test(sql)) steps.push(sql)
      return fake.executor.query(sql, params)
    },
  }
  const appliedFolderNames = await runMigrations(executor, {
    folders,
    log: () => {},
    migrateThrough: async (lastFolderName) => {
      steps.push(`migrate through ${lastFolderName ?? "the last folder"}`)
    },
  }).catch((error: unknown) => error as Error)
  return { appliedFolderNames, steps }
}

describe("runMigrations", () => {
  describe("正常系", () => {
    it("online.sql を持つフォルダまでの migration.sql を適用してから online.sql を流し、最後に残りを適用する", async () => {
      const fake = createFakeSqlExecutor()

      const { appliedFolderNames, steps } = await run(fake, [
        buildFolder("0001_init"),
        buildFolder("0002_add", [CREATE_OWNER_INDEX]),
        buildFolder("0003_rename_column"),
        buildFolder("0004_add", [CREATE_NAME_INDEX]),
        buildFolder("0005_last"),
      ])

      expect(steps).toEqual([
        "migrate through 0002_add",
        CREATE_OWNER_INDEX,
        "migrate through 0004_add",
        CREATE_NAME_INDEX,
        "migrate through the last folder",
      ])
      expect(appliedFolderNames).toEqual(["0002_add", "0004_add"])
      expect([...fake.appliedFolderNames]).toEqual(["0002_add", "0004_add"])
      expect(fake.indexes.get(OWNER_INDEX_KEY)).toBe(true)
    })

    it("online.sql を適用済みのフォルダは飛ばし、残りの migration.sql だけを適用する", async () => {
      const fake = createFakeSqlExecutor({ appliedFolderNames: ["0002_add"], indexes: { [OWNER_INDEX_KEY]: true } })

      const { appliedFolderNames, steps } = await run(fake, [buildFolder("0002_add", [CREATE_OWNER_INDEX]), buildFolder("0003_last")])

      expect(steps).toEqual(["migrate through the last folder"])
      expect(appliedFolderNames).toEqual([])
    })

    it("無効な index が残っていれば、消してから作り直す", async () => {
      const fake = createFakeSqlExecutor({ indexes: { [OWNER_INDEX_KEY]: false } })

      const { steps } = await run(fake, [buildFolder("0002_add", [CREATE_OWNER_INDEX])])

      expect(steps).toEqual([
        "migrate through 0002_add",
        "DROP INDEX CONCURRENTLY IF EXISTS \"public\".\"items_owner_id_idx\"",
        CREATE_OWNER_INDEX,
        "migrate through the last folder",
      ])
      expect(fake.indexes.get(OWNER_INDEX_KEY)).toBe(true)
    })

    it("online.sql の DROP INDEX CONCURRENTLY を流す", async () => {
      const fake = createFakeSqlExecutor({ appliedFolderNames: ["0002_add"], indexes: { [OWNER_INDEX_KEY]: true } })

      const { steps } = await run(fake, [buildFolder("0002_add", [CREATE_OWNER_INDEX]), buildFolder("0003_drop", [DROP_OWNER_INDEX])])

      expect(steps).toEqual(["migrate through 0003_drop", DROP_OWNER_INDEX, "migrate through the last folder"])
      expect(fake.indexes.has(OWNER_INDEX_KEY)).toBe(false)
    })
  })

  describe("異常系", () => {
    it("index の作成に失敗したら throw し、そのフォルダを履歴に記録せず、先の migration.sql も適用しない", async () => {
      const fake = createFakeSqlExecutor({ failingIndexKeys: [OWNER_INDEX_KEY] })

      const { appliedFolderNames, steps } = await run(fake, [buildFolder("0002_add", [CREATE_OWNER_INDEX]), buildFolder("0003_last")])

      expect(appliedFolderNames).toEqual(new Error("could not create unique index \"items_owner_id_idx\""))
      expect(steps).toEqual(["migrate through 0002_add", CREATE_OWNER_INDEX])
      expect([...fake.appliedFolderNames]).toEqual([])
      expect(fake.indexes.get(OWNER_INDEX_KEY)).toBe(false)
    })

    it("無効な index が別のセッションで作成中なら、消さずに throw する", async () => {
      const fake = createFakeSqlExecutor({
        buildingIndexNames: ["\"public\".\"items_owner_id_idx\""],
        indexes: { [OWNER_INDEX_KEY]: false },
      })

      const { appliedFolderNames, steps } = await run(fake, [buildFolder("0002_add", [CREATE_OWNER_INDEX])])

      expect(appliedFolderNames).toEqual(new Error("index \"public\".\"items_owner_id_idx\" is being built by another session. Run db:migrate again after it finishes"))
      expect(steps).toEqual(["migrate through 0002_add"])
      expect([...fake.appliedFolderNames]).toEqual([])
    })

    it("作成後も index が無効なら throw する", async () => {
      const fake = createFakeSqlExecutor()
      const executor = {
        query: async (sql: string, params?: unknown[]) =>
          sql.includes("pg_catalog.pg_index") ? { rows: [{ valid: false }] } : fake.executor.query(sql, params),
      }

      await expect(
        runMigrations(executor, { folders: [buildFolder("0002_add", [CREATE_OWNER_INDEX])], log: () => {}, migrateThrough: async () => {} }),
      ).rejects.toThrow("is not valid after")
      expect([...fake.appliedFolderNames]).toEqual([])
    })

    it("migration.sql の適用に失敗したら throw し、online.sql を流さない", async () => {
      const fake = createFakeSqlExecutor()

      await expect(
        runMigrations(fake.executor, {
          folders: [buildFolder("0002_add", [CREATE_OWNER_INDEX])],
          log: () => {},
          migrateThrough: async () => {
            throw new Error("drizzle-kit migrate exited with code 1")
          },
        }),
      ).rejects.toThrow("drizzle-kit migrate exited with code 1")
      expect(fake.indexStatements()).toEqual([])
      expect([...fake.appliedFolderNames]).toEqual([])
    })
  })
})
