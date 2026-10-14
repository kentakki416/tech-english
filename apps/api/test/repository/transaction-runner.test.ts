import { DrizzleTransactionRunner } from "../../src/repository/drizzle/transaction-runner"
import { DrizzleUserRepository } from "../../src/repository/drizzle/user-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

/**
 * TransactionRunner が、callback 内の書き込みを 1 つのトランザクションとして
 * commit / rollback することを確かめる。
 */
const transactionRunner = new DrizzleTransactionRunner(testDb)
const userRepository = new DrizzleUserRepository(testDb)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("TransactionRunner", () => {
  describe("正常系", () => {
    it("callback が成功すると、tx を渡した書き込みが commit される", async () => {
      const created = await transactionRunner.run(async (tx) =>
        userRepository.create({ email: "commit@example.com" }, tx))

      expect(await userRepository.findById(created.id)).toEqual(created)
    })
  })

  describe("異常系", () => {
    it("callback が throw すると、tx を渡した書き込みが rollback される", async () => {
      await expect(
        transactionRunner.run(async (tx) => {
          await userRepository.create({ email: "rollback@example.com" }, tx)
          throw new Error("rollback")
        }),
      ).rejects.toThrow("rollback")

      expect(await userRepository.findByEmail("rollback@example.com")).toBeNull()
    })
  })
})
