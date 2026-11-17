import { parseOnlineSql } from "../../migrate/online-statement"

describe("parseOnlineSql", () => {
  describe("正常系", () => {
    it("CREATE INDEX CONCURRENTLY IF NOT EXISTS から index 名と schema を取り出す", () => {
      const sql = "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"items_owner_id_idx\" ON \"items\" (\"owner_id\");\n"

      expect(parseOnlineSql(sql)).toEqual([
        {
          indexName: "items_owner_id_idx",
          kind: "createIndex",
          schema: "public",
          sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"items_owner_id_idx\" ON \"items\" (\"owner_id\")",
        },
      ])
    })

    it("schema 付きのテーブルの unique index は、テーブルの schema を返す", () => {
      const sql = "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS \"items_name_key\" ON \"shop\".\"items\" USING btree (\"name\");"

      expect(parseOnlineSql(sql)).toMatchObject([{ indexName: "items_name_key", kind: "createIndex", schema: "shop" }])
    })

    it("DROP INDEX CONCURRENTLY IF EXISTS から index 名と schema を取り出す", () => {
      const sql = "DROP INDEX CONCURRENTLY IF EXISTS \"items_owner_id_idx\";\nDROP INDEX CONCURRENTLY IF EXISTS \"shop\".\"items_name_key\";"

      expect(parseOnlineSql(sql)).toMatchObject([
        { indexName: "items_owner_id_idx", kind: "dropIndex", schema: "public" },
        { indexName: "items_name_key", kind: "dropIndex", schema: "shop" },
      ])
    })

    it("コメントと空行は無視する", () => {
      const sql = "-- 理由\n\n/* 複数行の\nコメント */\nDROP INDEX CONCURRENTLY IF EXISTS \"items_owner_id_idx\";\n"

      expect(parseOnlineSql(sql)).toHaveLength(1)
    })

    it("文字列リテラルの中の ; と -- を、文の区切りやコメントと取り違えない", () => {
      const sql = "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"items_note_idx\" ON \"items\" (\"note\") WHERE \"note\" <> 'a;b--c''d';\nDROP INDEX CONCURRENTLY IF EXISTS \"old_idx\";"

      expect(parseOnlineSql(sql)).toMatchObject([
        { indexName: "items_note_idx", sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"items_note_idx\" ON \"items\" (\"note\") WHERE \"note\" <> 'a;b--c''d'" },
        { indexName: "old_idx" },
      ])
    })

    it("dollar quote の中の ; を、文の区切りと取り違えない", () => {
      const sql = "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"items_note_idx\" ON \"items\" (\"note\") WHERE \"note\" <> $$a;b$$ AND \"tag\" <> $t$c;d$t$;\nDROP INDEX CONCURRENTLY IF EXISTS \"old_idx\";"

      expect(parseOnlineSql(sql)).toMatchObject([{ indexName: "items_note_idx" }, { indexName: "old_idx" }])
    })

    it("語の間のブロックコメントは空白にする", () => {
      const sql = "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"items_enabled_idx\" ON \"items\" (\"id\") WHERE \"enabled\"/*理由*/IS TRUE;"

      expect(parseOnlineSql(sql)).toMatchObject([
        { sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"items_enabled_idx\" ON \"items\" (\"id\") WHERE \"enabled\" IS TRUE" },
      ])
    })

    it("引用符の無い識別子は小文字にする", () => {
      expect(parseOnlineSql("DROP INDEX CONCURRENTLY IF EXISTS Items_Owner_Id_Idx;")).toMatchObject([
        { indexName: "items_owner_id_idx" },
      ])
    })
  })

  describe("異常系", () => {
    it.each([
      ["CONCURRENTLY の無い CREATE INDEX", "CREATE INDEX IF NOT EXISTS \"a_idx\" ON \"items\" (\"a\");"],
      ["IF NOT EXISTS の無い CREATE INDEX", "CREATE INDEX CONCURRENTLY \"a_idx\" ON \"items\" (\"a\");"],
      ["IF EXISTS の無い DROP INDEX", "DROP INDEX CONCURRENTLY \"a_idx\";"],
      ["index 以外の文", "ALTER TABLE \"items\" VALIDATE CONSTRAINT \"items_check\";"],
    ])("%s は throw する", (_, sql) => {
      expect(() => parseOnlineSql(sql)).toThrow("online.sql accepts only")
    })
  })
})
