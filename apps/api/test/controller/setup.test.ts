import { createDrizzleClient } from "@repo/db"

import { disconnectTestDb, disconnectTestRedis, forTesting, testDb } from "./setup"

const { assertConnectedToTestDatabase } = forTesting

/**
 * テスト用でない DB の例として、Postgres が必ず持つ管理用の DB（postgres）に繋ぐ
 */
const createMaintenanceDatabaseClient = () => {
  const url = new URL(process.env.DATABASE_URL ?? "")
  url.pathname = "/postgres"
  return createDrizzleClient({ url: url.toString() })
}

afterAll(async () => {
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("assertConnectedToTestDatabase", () => {
  describe("正常系", () => {
    it("名前が _test で終わる DB に繋いでいれば通る", async () => {
      await expect(assertConnectedToTestDatabase(testDb)).resolves.toBeUndefined()
    })
  })

  describe("異常系", () => {
    it("名前が _test で終わらない DB に繋いでいれば throw する", async () => {
      const client = createMaintenanceDatabaseClient()
      try {
        await expect(assertConnectedToTestDatabase(client)).rejects.toThrow()
      } finally {
        await client.$disconnect()
      }
    })
  })
})
