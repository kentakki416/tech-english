import { authAccounts, eq } from "@repo/db"

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

    it("deleteById で削除され、findById が null を返し、紐づく auth_accounts も cascade で消える", async () => {
      const created = await userRepository.create({ email: "delete@example.com" })
      const other = await userRepository.create({ email: "other@example.com" })
      await testDb.insert(authAccounts).values([
        { provider: "github", providerAccountId: "github-1", userId: created.id },
        { provider: "github", providerAccountId: "github-2", userId: other.id },
      ])

      await userRepository.deleteById(created.id)

      expect(await userRepository.findById(created.id)).toBeNull()
      expect(await testDb.select().from(authAccounts).where(eq(authAccounts.userId, created.id))).toEqual([])
      /** 別のユーザーと、その auth_accounts は残る */
      expect(await userRepository.findById(other.id)).toEqual(other)
      expect(await testDb.select().from(authAccounts).where(eq(authAccounts.userId, other.id))).toHaveLength(1)
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

    it("存在しない id の deleteById は何もしない", async () => {
      await expect(userRepository.deleteById(999999)).resolves.toBeUndefined()
    })
  })
})
