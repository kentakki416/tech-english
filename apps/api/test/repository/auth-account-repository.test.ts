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

describe("AuthAccountRepository.findProvidersByUserId", () => {
  describe("正常系", () => {
    it("そのユーザーのログイン方法を名前順で返す（他のユーザーのものは含めない）", async () => {
      const user = await userRepository.create({ email: "test@example.com", name: "Test User" })
      const other = await userRepository.create({ email: "other@example.com", name: "Other" })
      await authAccountRepository.create({ provider: "google", providerAccountId: "g-1", userId: user.id })
      await authAccountRepository.create({ provider: "github", providerAccountId: "h-1", userId: user.id })
      await authAccountRepository.create({ provider: "dev", providerAccountId: "d-1", userId: other.id })

      expect(await authAccountRepository.findProvidersByUserId(user.id)).toEqual(["github", "google"])
    })
  })

  describe("異常系", () => {
    it("ログイン方法が無ければ空の配列", async () => {
      const user = await userRepository.create({ email: "test@example.com", name: "Test User" })

      expect(await authAccountRepository.findProvidersByUserId(user.id)).toEqual([])
    })
  })
})
