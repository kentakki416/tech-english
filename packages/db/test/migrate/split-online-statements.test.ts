import { forTesting } from "../../migrate/split-online-statements"

const { splitOnlineStatements } = forTesting

describe("splitOnlineStatements", () => {
  describe("正常系", () => {
    it("CREATE INDEX CONCURRENTLY に IF NOT EXISTS を付けて取り出し、ほかの文は残す", () => {
      const migrationSql = [
        "ALTER TABLE \"items\" ADD COLUMN \"owner_id\" integer;--> statement-breakpoint",
        "CREATE INDEX CONCURRENTLY \"items_owner_id_idx\" ON \"items\" (\"owner_id\");--> statement-breakpoint",
        "CREATE UNIQUE INDEX CONCURRENTLY \"items_name_key\" ON \"items\" (\"name\");--> statement-breakpoint",
        "CREATE INDEX \"items_plain_idx\" ON \"items\" (\"name\",\"owner_id\");",
      ].join("\n")

      expect(splitOnlineStatements(migrationSql)).toEqual({
        migrationSql: [
          "ALTER TABLE \"items\" ADD COLUMN \"owner_id\" integer;--> statement-breakpoint",
          "CREATE INDEX \"items_plain_idx\" ON \"items\" (\"name\",\"owner_id\");",
          "",
        ].join("\n"),
        onlineStatements: [
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"items_owner_id_idx\" ON \"items\" (\"owner_id\");",
          "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS \"items_name_key\" ON \"items\" (\"name\");",
        ],
      })
    })

    it("すべての文を取り出したら、migration.sql にはコメントだけを残す", () => {
      const { migrationSql } = splitOnlineStatements("CREATE INDEX CONCURRENTLY \"a_idx\" ON \"items\" (\"a\");")

      expect(migrationSql).toMatch(/^-- [^\n]+\n$/)
    })

    it("取り出す文が無ければ、migration.sql を変えない", () => {
      const migrationSql = "CREATE TABLE \"items\" (\"id\" serial PRIMARY KEY);--> statement-breakpoint\nCREATE INDEX \"a_idx\" ON \"items\" (\"id\");"

      expect(splitOnlineStatements(migrationSql)).toEqual({ migrationSql, onlineStatements: [] })
    })

    it("書き換える文が無ければ、空白や改行が生成時と違っていても 1 文字も変えない", () => {
      const migrationSql = "\n\nCREATE TABLE \"items\" (\n\t\"id\" serial PRIMARY KEY\n);\n--> statement-breakpoint\n\nDROP INDEX \"items_plain_idx\";\n\n\n"

      expect(splitOnlineStatements(migrationSql).migrationSql).toBe(migrationSql)
    })

    it("取り出した後の migration.sql をもう一度渡しても、何も取り出さない", () => {
      const first = splitOnlineStatements(
        "ALTER TABLE \"items\" ADD COLUMN \"a\" integer;--> statement-breakpoint\nCREATE INDEX CONCURRENTLY \"a_idx\" ON \"items\" (\"a\");",
      )

      expect(splitOnlineStatements(first.migrationSql)).toEqual({ migrationSql: first.migrationSql, onlineStatements: [] })
    })
  })
})
