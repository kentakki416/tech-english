import request from "supertest"

import { admins, eq } from "@repo/db"

import { GoogleUserInfo, IGoogleOAuthClient } from "../../../../src/client/google-oauth"
import { AdminAuthGoogleController } from "../../../../src/controller/admin/auth/google"
import { verifyAdminRefreshToken } from "../../../../src/lib/admin-jwt"
import { DrizzleAdminRepository } from "../../../../src/repository/drizzle/admin-repository"
import { IoRedisRefreshTokenRepository } from "../../../../src/repository/redis"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testDb,
  testRedis,
} from "../../setup"

const mockGetUserInfo = vi.fn<(_0: string, _1: string) => Promise<GoogleUserInfo>>()
const mockGoogleOAuthClient: IGoogleOAuthClient = { getUserInfo: mockGetUserInfo }

const adminRepository = new DrizzleAdminRepository(testDb)
const adminRefreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis, "admin_refresh_token")

const app = createTestApp()

mountAdminApi(app, adminRouter({
  auth: { google: new AdminAuthGoogleController(adminRepository, adminRefreshTokenRepository, mockGoogleOAuthClient) },
}))
attachUnhandledExceptionHandler(app)

const REDIRECT_URI = "http://localhost:3030/api/auth/callback/google"

const googleUser: GoogleUserInfo = {
  email: "Admin@Example.com",
  emailVerified: true,
  id: "google-1",
  name: "Admin From Google",
  picture: "https://example.com/a.png",
}

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  vi.clearAllMocks()
})

afterAll(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/auth/google", () => {
  describe("正常系", () => {
    it("登録済みの admin なら 200 でトークンを返し、名前・アイコン・最終サインイン日時を更新し、refresh の jti を保存する", async () => {
      const [row] = await testDb.insert(admins).values({ email: "admin@example.com" }).returning()
      mockGetUserInfo.mockResolvedValue(googleUser)

      const res = await request(app)
        .post("/api/admin/auth/google")
        .send({ code: "code", redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        access_token: expect.any(String),
        admin: {
          id: row.id,
          avatar_url: "https://example.com/a.png",
          email: "admin@example.com",
          name: "Admin From Google",
        },
        refresh_token: expect.any(String),
      })

      const [updated] = await testDb.select().from(admins).where(eq(admins.id, row.id))
      expect(updated).toMatchObject({
        avatarUrl: "https://example.com/a.png",
        lastSignedInAt: expect.any(Date),
        name: "Admin From Google",
      })

      const payload = verifyAdminRefreshToken(res.body.refresh_token)
      expect(payload).not.toBeNull()
      expect(await testRedis.get(`admin_refresh_token:${payload!.jti}`)).toBe(String(row.id))
    })
  })

  describe("異常系", () => {
    it("admins に登録が無い email は 403 で、Redis に何も残らない", async () => {
      mockGetUserInfo.mockResolvedValue(googleUser)

      const res = await request(app)
        .post("/api/admin/auth/google")
        .send({ code: "code", redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 403 })
      expect(await testRedis.keys("admin_refresh_token:*")).toEqual([])
    })

    it("Google で email が未確認なら、登録済みでも 403 で、admin の行も変えない", async () => {
      const [row] = await testDb.insert(admins).values({ email: "admin@example.com" }).returning()
      mockGetUserInfo.mockResolvedValue({ ...googleUser, emailVerified: false })

      const res = await request(app)
        .post("/api/admin/auth/google")
        .send({ code: "code", redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(403)
      expect(await testRedis.keys("admin_refresh_token:*")).toEqual([])
      const [unchanged] = await testDb.select().from(admins).where(eq(admins.id, row.id))
      expect(unchanged).toEqual(row)
    })

    it("code が無ければ 400", async () => {
      const res = await request(app)
        .post("/api/admin/auth/google")
        .send({ redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(400)
    })
  })
})
