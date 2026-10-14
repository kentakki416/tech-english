import { DrizzleAuthAccountRepository } from "../../src/repository/drizzle/auth-account-repository"
import { DrizzleUserRepository } from "../../src/repository/drizzle/user-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

const authAccountRepository = new DrizzleAuthAccountRepository(testDb)
const userRepository = new DrizzleUserRepository(testDb)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("AuthAccountRepository", () => {
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
