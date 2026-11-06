import { verifyLocalDatabaseExists } from "../../../clickhouse/migrate/verify-local-database"

import { createFakeClickHouseClient } from "./support/fake-clickhouse-client"

describe("verifyLocalDatabaseExists", () => {
  describe("正常系", () => {
    it("database があれば通る", async () => {
      const { client } = createFakeClickHouseClient({ existingCdcTables: [], existingDatabases: ["tech_english"] })

      await expect(verifyLocalDatabaseExists(client, "tech_english")).resolves.toBeUndefined()
    })
  })

  describe("異常系", () => {
    it("database が無ければ、何も実行せずに throw する（別プロジェクトの ClickHouse に繋いでいる）", async () => {
      const { calls, client } = createFakeClickHouseClient({ existingCdcTables: [], existingDatabases: ["project_template"] })

      await expect(verifyLocalDatabaseExists(client, "tech_english")).rejects.toThrow("does not exist on the local ClickHouse")
      expect(calls.filter((call) => call.kind === "command")).toEqual([])
    })
  })
})
