import { applyViews } from "../../../clickhouse/migrate/apply-views"

import { createFakeClickHouseClient } from "./support/fake-clickhouse-client"

const VIEWS = [
  { sql: "CREATE OR REPLACE VIEW v_users AS SELECT * FROM ${CDC_DATABASE}.users WHERE ${CDC_LIVE_FILTER}", table: "users" },
  { sql: "CREATE OR REPLACE VIEW v_memos AS SELECT * FROM ${CDC_DATABASE}.memos WHERE ${CDC_LIVE_FILTER}", table: "memos" },
]

describe("applyViews", () => {
  describe("正常系", () => {
    it("CDC の実装に合わせて変数を埋めて view を作り直す", async () => {
      const { calls, client } = createFakeClickHouseClient({ existingCdcTables: ["users", "memos"] })

      const skipped = await applyViews(client, { cdcMode: "clickpipes", views: VIEWS })

      expect(skipped).toEqual([])
      expect(calls.filter((call) => call.kind === "command").map((call) => call.query)).toEqual([
        "CREATE OR REPLACE VIEW v_users AS SELECT * FROM pg_cdc.users WHERE _peerdb_is_deleted = 0",
        "CREATE OR REPLACE VIEW v_memos AS SELECT * FROM pg_cdc.memos WHERE _peerdb_is_deleted = 0",
      ])
    })

    it("clickpipes で元テーブルがまだ無い view は作らずに返す（ClickPipe の初回の取り込み前）", async () => {
      const { calls, client } = createFakeClickHouseClient({ existingCdcTables: ["users"] })

      const skipped = await applyViews(client, { cdcMode: "clickpipes", views: VIEWS })

      expect(skipped).toEqual(["memos"])
      expect(calls.filter((call) => call.kind === "command")).toHaveLength(1)
    })
  })

  describe("異常系", () => {
    it("materialized_postgresql で元テーブルが無ければ throw する（取り込みを待った後なので異常）", async () => {
      const { client } = createFakeClickHouseClient({ existingCdcTables: ["users"] })

      await expect(applyViews(client, { cdcMode: "materialized_postgresql", views: VIEWS })).rejects.toThrow("pg_cdc.memos")
    })
  })
})
