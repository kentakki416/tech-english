import { DrizzleUserRepository } from "../../src/repository/drizzle/user-repository"
import { PrismaUserRepository } from "../../src/repository/prisma/user-repository"
import type { UserRepository } from "../../src/repository/user-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"

/**
 * Prisma / Drizzle の両実装が UserRepository として同じ振る舞いをすることを確かめる。
 */
const implementations: [string, UserRepository][] = [
  ["Drizzle", new DrizzleUserRepository(testDb)],
  ["Prisma", new PrismaUserRepository(testPrisma)],
]

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s UserRepository", (_name, userRepository) => {
  describe("正常系", () => {
    it("create したユーザーを findById / findByEmail で取得できる", async () => {
      const created = await userRepository.create({
        avatarUrl: "https://example.com/avatar.jpg",
        email: "test@example.com",
        name: "Test User",
      })

      expect(await userRepository.findById(created.id)).toEqual(created)
      expect(await userRepository.findByEmail("test@example.com")).toEqual(created)
    })

    it("省略した項目は null で保存される", async () => {
      const created = await userRepository.create({})

      expect(created).toMatchObject({ avatarUrl: null, email: null, name: null })
    })
  })

  describe("異常系", () => {
    it("存在しない id / email では null を返す", async () => {
      expect(await userRepository.findById(999999)).toBeNull()
      expect(await userRepository.findByEmail("missing@example.com")).toBeNull()
    })

    it("email が重複すると throw する", async () => {
      await userRepository.create({ email: "dup@example.com" })

      await expect(userRepository.create({ email: "dup@example.com" })).rejects.toThrow()
    })
  })
})
