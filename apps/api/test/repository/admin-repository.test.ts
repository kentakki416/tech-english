import { admins } from "@repo/db"

import { DrizzleAdminRepository } from "../../src/repository/drizzle/admin-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

/**
 * Drizzle 実装の AdminRepository を実 DB で確かめる。列の対応・CHECK 制約・updated_at の更新は mock では検出できないため
 */
const adminRepository = new DrizzleAdminRepository(testDb)

const OLD_UPDATED_AT = new Date("2026-01-01T00:00:00.000Z")

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("DrizzleAdminRepository", () => {
  describe("findByEmail / findById", () => {
    describe("正常系", () => {
      it("登録した admin を email と ID で取得できる", async () => {
        const [row] = await testDb.insert(admins).values({ email: "admin@example.com", name: "Admin" }).returning()

        const expected = {
          id: row.id,
          avatarUrl: null,
          email: "admin@example.com",
          lastSignedInAt: null,
          name: "Admin",
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }
        expect(await adminRepository.findByEmail("admin@example.com")).toEqual(expected)
        expect(await adminRepository.findById(row.id)).toEqual(expected)
      })
    })

    describe("異常系", () => {
      it("登録していない email / ID は null を返す", async () => {
        expect(await adminRepository.findByEmail("missing@example.com")).toBeNull()
        expect(await adminRepository.findById(999999)).toBeNull()
      })
    })
  })

  describe("recordSignIn", () => {
    describe("正常系", () => {
      it("profile を渡すと、名前・アイコン・最終サインイン日時と更新日時が変わる", async () => {
        const [row] = await testDb
          .insert(admins)
          .values({ email: "admin@example.com", updatedAt: OLD_UPDATED_AT })
          .returning()
        const signedInAt = new Date("2026-10-15T01:02:03.456Z")

        const updated = await adminRepository.recordSignIn(row.id, {
          profile: { avatarUrl: "https://example.com/a.png", name: "From Google" },
          signedInAt,
        })

        expect(updated).toMatchObject({
          avatarUrl: "https://example.com/a.png",
          email: "admin@example.com",
          lastSignedInAt: signedInAt,
          name: "From Google",
        })
        expect(updated.updatedAt.getTime()).toBeGreaterThan(OLD_UPDATED_AT.getTime())
        expect(await adminRepository.findById(row.id)).toMatchObject({
          avatarUrl: "https://example.com/a.png",
          lastSignedInAt: signedInAt,
          name: "From Google",
        })
      })

      it("profile を渡さないと、名前とアイコンはそのままで、最終サインイン日時と更新日時だけが変わる", async () => {
        const [row] = await testDb
          .insert(admins)
          .values({ avatarUrl: "https://example.com/old.png", email: "admin@example.com", name: "Old", updatedAt: OLD_UPDATED_AT })
          .returning()
        const signedInAt = new Date("2026-10-15T01:02:03.456Z")

        const updated = await adminRepository.recordSignIn(row.id, { signedInAt })

        expect(updated).toMatchObject({
          avatarUrl: "https://example.com/old.png",
          lastSignedInAt: signedInAt,
          name: "Old",
        })
        expect(updated.updatedAt.getTime()).toBeGreaterThan(OLD_UPDATED_AT.getTime())
      })
    })

    describe("異常系", () => {
      it("存在しない ID を渡すと throw する", async () => {
        await expect(adminRepository.recordSignIn(999999, { signedInAt: new Date() })).rejects.toThrow()
      })
    })
  })

  describe("admins の制約", () => {
    describe("異常系", () => {
      it("同じ email は 2 回登録できない（admins_email_key）", async () => {
        await testDb.insert(admins).values({ email: "admin@example.com" })

        await expect(testDb.insert(admins).values({ email: "admin@example.com" })).rejects.toThrow()
      })

      it.each(["Admin@example.com", " admin@example.com", "admin@example.com "])(
        "%j は小文字で前後に空白の無い形でないので登録できない（admins_email_check）",
        async (email) => {
          await expect(testDb.insert(admins).values({ email })).rejects.toThrow()
        },
      )
    })
  })
})
