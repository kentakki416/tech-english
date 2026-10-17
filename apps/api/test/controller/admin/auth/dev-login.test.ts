import request from "supertest"

import { admins, eq } from "@repo/db"

import { AdminAuthDevLoginController } from "../../../../src/controller/admin/auth/dev-login"
import { verifyAdminAccessToken, verifyAdminRefreshToken } from "../../../../src/lib/admin-jwt"
import { DrizzleAdminRepository } from "../../../../src/repository/drizzle/admin-repository"
import { IoRedisRefreshTokenRepository } from "../../../../src/repository/redis"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testDb,
  testRedis,
} from "../../setup"

const adminRepository = new DrizzleAdminRepository(testDb)
const adminRefreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis, "admin_refresh_token")

const app = createTestApp()

mountAdminApi(app, adminRouter({
  auth: { devLogin: new AdminAuthDevLoginController(adminRepository, adminRefreshTokenRepository) },
}))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
})

afterAll(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/auth/dev-login", () => {
  describe("正常系", () => {
    it("admin@dev.local なら access token なしで呼べ、200 でトークンを返し、最終サインイン日時を更新して refresh の jti を保存する", async () => {
      const { admin } = await createTestAdmin({ email: "admin@dev.local", name: "Admin (dev)" })

      const res = await request(app).post("/api/admin/auth/dev-login").send({ email: "admin@dev.local" })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        access_token: expect.any(String),
        admin: {
          id: admin.id,
          avatar_url: null,
          email: "admin@dev.local",
          name: "Admin (dev)",
        },
        refresh_token: expect.any(String),
      })
      expect(verifyAdminAccessToken(res.body.access_token)).toMatchObject({ adminId: admin.id })

      const [updated] = await testDb.select().from(admins).where(eq(admins.id, admin.id))
      expect(updated).toMatchObject({ lastSignedInAt: expect.any(Date), name: "Admin (dev)" })

      const payload = verifyAdminRefreshToken(res.body.refresh_token)
      expect(await testRedis.get(`admin_refresh_token:${payload!.jti}`)).toBe(String(admin.id))
      expect(await testRedis.keys("refresh_token*")).toEqual([])
    })
  })

  describe("異常系", () => {
    it("@dev.local 以外の email は、admins に登録済みでも 404 で、トークンを発行しない", async () => {
      await createTestAdmin({ email: "admin@example.com" })

      const res = await request(app).post("/api/admin/auth/dev-login").send({ email: "admin@example.com" })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
      expect(await testRedis.keys("*")).toEqual([])
    })

    it("@dev.local でも admins に居なければ 404", async () => {
      const res = await request(app).post("/api/admin/auth/dev-login").send({ email: "admin@dev.local" })

      expect(res.status).toBe(404)
      expect(await testRedis.keys("*")).toEqual([])
    })

    it("email の形でなければ 400", async () => {
      const res = await request(app).post("/api/admin/auth/dev-login").send({ email: "not-an-email" })

      expect(res.status).toBe(400)
    })
  })
})
