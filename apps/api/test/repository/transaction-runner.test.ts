import { DrizzleTransactionRunner } from "../../src/repository/drizzle/transaction-runner"
import { DrizzleUserRepository } from "../../src/repository/drizzle/user-repository"
import { PrismaTransactionRunner } from "../../src/repository/prisma/transaction-runner"
import { PrismaUserRepository } from "../../src/repository/prisma/user-repository"
import type { TransactionRunner } from "../../src/repository/transaction"
import type { UserRepository } from "../../src/repository/user-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"

/**
 * Prisma / Drizzle の両実装の TransactionRunner が、callback 内の書き込みを
 * 1 つのトランザクションとして commit / rollback することを確かめる。
 */
const implementations: [string, TransactionRunner, UserRepository][] = [
  ["Drizzle", new DrizzleTransactionRunner(testDb), new DrizzleUserRepository(testDb)],
  ["Prisma", new PrismaTransactionRunner(testPrisma), new PrismaUserRepository(testPrisma)],
]

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s TransactionRunner", (_name, transactionRunner, userRepository) => {
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
