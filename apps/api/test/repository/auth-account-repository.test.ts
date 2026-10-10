import type { AuthAccountRepository } from "../../src/repository/auth-account-repository"
import { DrizzleAuthAccountRepository } from "../../src/repository/drizzle/auth-account-repository"
import { DrizzleUserRepository } from "../../src/repository/drizzle/user-repository"
import { PrismaAuthAccountRepository } from "../../src/repository/prisma/auth-account-repository"
import { PrismaUserRepository } from "../../src/repository/prisma/user-repository"
import type { UserRepository } from "../../src/repository/user-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"

/**
 * Prisma / Drizzle の両実装が AuthAccountRepository として同じ振る舞いをすることを確かめる。
 */
const implementations: [string, AuthAccountRepository, UserRepository][] = [
  ["Drizzle", new DrizzleAuthAccountRepository(testDb), new DrizzleUserRepository(testDb)],
  ["Prisma", new PrismaAuthAccountRepository(testPrisma), new PrismaUserRepository(testPrisma)],
]

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s AuthAccountRepository", (_name, authAccountRepository, userRepository) => {
  describe("正常系", () => {
    it("create した認証アカウントを、紐付くユーザーごと findByProvider で取得できる", async () => {
      const user = await userRepository.create({ email: "test@example.com", name: "Test User" })
      const created = await authAccountRepository.create({
        provider: "google",
        providerAccountId: "google-123",
        userId: user.id,
      })

      const found = await authAccountRepository.findByProvider("google", "google-123")

      expect(found).toEqual({ ...created, user })
    })
  })

  describe("異常系", () => {
    it("存在しない provider / providerAccountId では null を返す", async () => {
      expect(await authAccountRepository.findByProvider("google", "missing")).toBeNull()
    })

    it("同じ provider / providerAccountId を重複して作ると throw する", async () => {
      const user = await userRepository.create({ email: "test@example.com" })
      const input = { provider: "google", providerAccountId: "google-123", userId: user.id }
      await authAccountRepository.create(input)

      await expect(authAccountRepository.create(input)).rejects.toThrow()
    })
  })
})
