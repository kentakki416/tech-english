import jwt from "jsonwebtoken"
import request from "supertest"

import { admins, eq } from "@repo/db"

import { AdminMeGetController } from "../../../../src/controller/admin/me/get"
import { DrizzleAdminRepository } from "../../../../src/repository/drizzle/admin-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp, createTestUser } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

const adminRepository = new DrizzleAdminRepository(testDb)

const app = createTestApp()

mountAdminApi(app, adminRouter({ me: { get: new AdminMeGetController(adminRepository) } }))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/me", () => {
  describe("正常系", () => {
    it("admin の access token で 200 とサインイン中の admin を返す", async () => {
      const { admin, token } = await createTestAdmin({ email: "admin@example.com", name: "Admin" })

      const res = await request(app).get("/api/admin/me").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: admin.id,
        avatar_url: null,
        email: "admin@example.com",
        last_signed_in_at: null,
        name: "Admin",
        created_at: admin.createdAt.toISOString(),
      })
    })

    it("最終サインイン日時があれば ISO 8601 で返す", async () => {
      const { admin, token } = await createTestAdmin()
      const signedInAt = new Date("2026-10-15T01:02:03.456Z")
      await testDb.update(admins).set({ lastSignedInAt: signedInAt }).where(eq(admins.id, admin.id))

      const res = await request(app).get("/api/admin/me").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.last_signed_in_at).toBe("2026-10-15T01:02:03.456Z")
    })
  })

  describe("異常系", () => {
    it("トークンなしは 401", async () => {
      const res = await request(app).get("/api/admin/me")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it.each(["/api/admin/me", "/API/ADMIN/me", "/Api/Admin/me"])(
      "一般ユーザーの access token は %s でも 401（大文字小文字ですり抜けない）",
      async (path) => {
        const { token } = await createTestUser()

        const res = await request(app).get(path).set("Authorization", `Bearer ${token}`)

        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      },
    )

    it("payload が admin の形でも、一般ユーザーの鍵で署名されたトークンは 401", async () => {
      const { admin } = await createTestAdmin()
      const token = jwt.sign({ adminId: admin.id }, process.env.JWT_ACCESS_SECRET!, { expiresIn: "15m" })

      const res = await request(app).get("/api/admin/me").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
    })

    it("admins から消された admin のトークンは 401", async () => {
      const { admin, token } = await createTestAdmin()
      await testDb.delete(admins).where(eq(admins.id, admin.id))

      const res = await request(app).get("/api/admin/me").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
