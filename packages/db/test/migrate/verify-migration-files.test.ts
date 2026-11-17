import { verifyMigrationFiles } from "../../migrate/verify-migration-files"

const CREATE_ONLINE = "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"items_owner_id_idx\" ON \"items\" (\"owner_id\");\n"

describe("verifyMigrationFiles", () => {
  describe("正常系", () => {
    it("online.sql に移してあれば問題なし", () => {
      expect(
        verifyMigrationFiles([
          { migrationSql: "ALTER TABLE \"items\" ADD COLUMN \"owner_id\" integer;", name: "0001_add", onlineSql: CREATE_ONLINE },
          { migrationSql: "DROP INDEX \"items_owner_id_idx\";", name: "0002_drop", onlineSql: undefined },
        ]),
      ).toEqual([])
    })

    it("文字列の中の INDEX CONCURRENTLY は問題にしない", () => {
      expect(
        verifyMigrationFiles([
          { migrationSql: "INSERT INTO \"messages\" (\"body\") VALUES ('CREATE INDEX CONCURRENTLY');", name: "0001_seed", onlineSql: undefined },
        ]),
      ).toEqual([])
    })

    it("コメントの中の INDEX CONCURRENTLY は問題にしない", () => {
      expect(
        verifyMigrationFiles([{ migrationSql: "-- CREATE INDEX CONCURRENTLY は online.sql に移した\nSELECT 1;", name: "0001", onlineSql: undefined }]),
      ).toEqual([])
    })
  })

  describe("異常系", () => {
    it("migration.sql に INDEX CONCURRENTLY が残っていれば問題を返す", () => {
      const problems = verifyMigrationFiles([
        { migrationSql: "CREATE INDEX CONCURRENTLY \"a_idx\" ON \"items\" (\"a\");", name: "0001_add", onlineSql: undefined },
      ])

      expect(problems).toEqual([expect.stringContaining("0001_add/migration.sql has an INDEX CONCURRENTLY statement")])
    })

    it("online.sql に書けない文があれば問題を返す", () => {
      const problems = verifyMigrationFiles([
        { migrationSql: "SELECT 1;", name: "0001_add", onlineSql: "CREATE INDEX \"a_idx\" ON \"items\" (\"a\");" },
      ])

      expect(problems).toEqual([expect.stringContaining("0001_add/online.sql: online.sql accepts only")])
    })
  })
})
