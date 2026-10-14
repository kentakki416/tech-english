import { rebuildLocalCdc } from "../../../clickhouse/migrate/rebuild-local-cdc"

import { createFakeClickHouseClient } from "./support/fake-clickhouse-client"

const POSTGRES = { database: "tech-english_dev", host: "postgres:5432", password: "password", user: "postgres" }
const OWN_ENGINE = "MaterializedPostgreSQL('postgres:5432', 'tech-english_dev', 'postgres', '[HIDDEN]') SETTINGS materialized_postgresql_tables_list = 'users,memos'"
const OTHER_PROJECT_ENGINE = "MaterializedPostgreSQL('postgres:5432', 'project-template_dev', 'postgres', '[HIDDEN]') SETTINGS materialized_postgresql_tables_list = 'users,memos'"

describe("rebuildLocalCdc", () => {
  describe("正常系", () => {
    it("このプロジェクトの pg_cdc を消して作り直す", async () => {
      const { calls, client } = createFakeClickHouseClient({ cdcEngineFull: OWN_ENGINE, existingCdcTables: ["users", "memos"] })

      await rebuildLocalCdc(client, { postgres: POSTGRES, tables: ["users", "memos"], timeoutMs: 1000 })

      const commands = calls.filter((call) => call.kind === "command").map((call) => call.query)
      expect(commands[0]).toBe("DROP DATABASE IF EXISTS pg_cdc SYNC")
      expect(commands[1]).toContain("MaterializedPostgreSQL('postgres:5432', 'tech-english_dev', 'postgres', 'password')")
      expect(commands[1]).toContain("materialized_postgresql_tables_list = 'users,memos'")
    })

    it("pg_cdc が無ければ作る", async () => {
      const { calls, client } = createFakeClickHouseClient({ existingCdcTables: ["users"] })

      await rebuildLocalCdc(client, { postgres: POSTGRES, tables: ["users"], timeoutMs: 1000 })

      expect(calls.filter((call) => call.kind === "command")).toHaveLength(2)
    })

    it("対象テーブルが空なら消すだけで作らない（空の一覧は MaterializedPostgreSQL では全テーブルの意味になる）", async () => {
      const { calls, client } = createFakeClickHouseClient({ cdcEngineFull: OWN_ENGINE, existingCdcTables: [] })

      await rebuildLocalCdc(client, { postgres: POSTGRES, tables: [], timeoutMs: 1000 })

      expect(calls.filter((call) => call.kind === "command").map((call) => call.query)).toEqual([
        "DROP DATABASE IF EXISTS pg_cdc SYNC",
      ])
    })
  })

  describe("異常系", () => {
    it("既にある pg_cdc が別プロジェクトの Postgres を取り込んでいれば、何も消さずに throw する", async () => {
      const { calls, client } = createFakeClickHouseClient({ cdcEngineFull: OTHER_PROJECT_ENGINE, existingCdcTables: ["users", "memos"] })

      await expect(
        rebuildLocalCdc(client, { postgres: POSTGRES, tables: ["users", "memos"], timeoutMs: 1000 }),
      ).rejects.toThrow("refusing to drop pg_cdc")
      expect(calls.filter((call) => call.kind === "command")).toEqual([])
    })

    it.each(["pass'word", "pass\\word"])("接続情報に SQL の文字列を壊す文字があれば、何も実行せずに throw する（%s）", async (password) => {
      const { calls, client } = createFakeClickHouseClient({ existingCdcTables: [] })

      await expect(
        rebuildLocalCdc(client, { postgres: { ...POSTGRES, password }, tables: ["users"], timeoutMs: 1000 }),
      ).rejects.toThrow("LOCAL_CDC_POSTGRES_")
      expect(calls).toEqual([])
    })

    it("テーブルが現れないまま時間切れになれば、現れなかったテーブル名を出して throw する", async () => {
      const { client } = createFakeClickHouseClient({ existingCdcTables: ["users"] })

      await expect(
        rebuildLocalCdc(client, { postgres: POSTGRES, tables: ["users", "memos"], timeoutMs: 0 }),
      ).rejects.toThrow("memos")
    })
  })
})
