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

    it("timezone を省略して作ると Asia/Tokyo になる", async () => {
      const created = await userRepository.create({ email: "tz@example.com" })

      expect(created.timezone).toBe("Asia/Tokyo")
      expect(await userRepository.findById(created.id)).toEqual(created)
    })

    it("create に timezone を渡すと保存される", async () => {
      const created = await userRepository.create({ email: "tz@example.com", timezone: "America/New_York" })

      expect(created.timezone).toBe("America/New_York")
      expect(await userRepository.findById(created.id)).toEqual(created)
    })

    it("updateProfile は名前とアイコンだけが変わり、メールとタイムゾーンは変わらない", async () => {
      const created = await userRepository.create({
        avatarUrl: "https://example.com/old.png",
        email: "profile@example.com",
        name: "Old Name",
        timezone: "UTC",
      })

      const updated = await userRepository.updateProfile(created.id, {
        avatarUrl: "https://example.com/new.png",
        name: "New Name",
      })

      expect(updated).toMatchObject({
        id: created.id,
        avatarUrl: "https://example.com/new.png",
        email: "profile@example.com",
        name: "New Name",
        timezone: "UTC",
      })
      expect(await userRepository.findById(created.id)).toEqual(updated)
    })

    it("updateProfile で avatarUrl に null を渡すとアイコンが消える", async () => {
      const created = await userRepository.create({ avatarUrl: "https://example.com/old.png", name: "Name" })

      const updated = await userRepository.updateProfile(created.id, { avatarUrl: null, name: "Name" })

      expect(updated.avatarUrl).toBeNull()
      expect(await userRepository.findById(created.id)).toEqual(updated)
    })

    it("updateTimezone でタイムゾーンだけが変わる", async () => {
      const created = await userRepository.create({ email: "tz@example.com", name: "Name" })

      const updated = await userRepository.updateTimezone(created.id, "Asia/Kolkata")

      expect(updated).toMatchObject({
        id: created.id,
        email: "tz@example.com",
        name: "Name",
        timezone: "Asia/Kolkata",
      })
      expect(await userRepository.findById(created.id)).toEqual(updated)
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

    it("存在しない id の updateProfile / updateTimezone は throw する", async () => {
      await expect(userRepository.updateProfile(999999, { avatarUrl: null, name: "Name" })).rejects.toThrow()
      await expect(userRepository.updateTimezone(999999, "UTC")).rejects.toThrow()
    })
  })
})
