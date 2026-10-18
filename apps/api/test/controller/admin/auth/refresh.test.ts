import jwt from "jsonwebtoken"
import request from "supertest"

import { admins, eq } from "@repo/db"

import { AdminAuthRefreshController } from "../../../../src/controller/admin/auth/refresh"
import { generateAdminRefreshToken, verifyAdminAccessToken, verifyAdminRefreshToken } from "../../../../src/lib/admin-jwt"
import { generateRefreshToken } from "../../../../src/lib/jwt"
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

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7

const adminRepository = new DrizzleAdminRepository(testDb)
const adminRefreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis, "admin_refresh_token")
const userRefreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis)

const app = createTestApp()

mountAdminApi(app, adminRouter({
  auth: { refresh: new AdminAuthRefreshController(adminRepository, adminRefreshTokenRepository) },
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

describe("POST /api/admin/auth/refresh", () => {
  describe("正常系", () => {
    it("admin の refresh token でローテーションし、旧 jti を消して新 jti を保存し、旧 jti の猶予の記録を残す", async () => {
      const { admin } = await createTestAdmin()
      const { jti: oldJti, token } = generateAdminRefreshToken(admin.id)
      await adminRefreshTokenRepository.save(oldJti, admin.id, REFRESH_TTL_SECONDS)

      const res = await request(app).post("/api/admin/auth/refresh").send({ refresh_token: token })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ access_token: expect.any(String), refresh_token: expect.any(String) })
      expect(verifyAdminAccessToken(res.body.access_token)).toMatchObject({ adminId: admin.id })
      expect(await adminRefreshTokenRepository.findUserId(oldJti)).toBeNull()
      const newPayload = verifyAdminRefreshToken(res.body.refresh_token)
      expect(await testRedis.get(`admin_refresh_token:${newPayload!.jti}`)).toBe(String(admin.id))
      expect(JSON.parse((await testRedis.get(`admin_refresh_token_rotated:${oldJti}`))!)).toEqual({
        accessToken: res.body.access_token,
        refreshToken: res.body.refresh_token,
      })
      /**
       * 一般ユーザーのキーには何も書かない
       */
      expect(await testRedis.keys("refresh_token*")).toEqual([])
    })

    it("猶予（30 秒）の間に同じ refresh token をもう一度使うと、1 回目と同じペアを返し、新しく発行しない", async () => {
      const { admin } = await createTestAdmin()
      const { jti, token } = generateAdminRefreshToken(admin.id)
      await adminRefreshTokenRepository.save(jti, admin.id, REFRESH_TTL_SECONDS)

      const first = await request(app).post("/api/admin/auth/refresh").send({ refresh_token: token })
      expect(first.status).toBe(200)

      const second = await request(app).post("/api/admin/auth/refresh").send({ refresh_token: token })
      expect(second.status).toBe(200)
      expect(second.body).toEqual(first.body)

      const ttl = await testRedis.ttl(`admin_refresh_token_rotated:${jti}`)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(30)
      const firstPayload = verifyAdminRefreshToken(first.body.refresh_token)
      expect(await testRedis.keys("admin_refresh_token:*")).toEqual([`admin_refresh_token:${firstPayload!.jti}`])
      expect(await testRedis.keys("refresh_token*")).toEqual([])
    })
  })

  describe("異常系", () => {
    it("一般ユーザーの refresh token は 401 で、一般ユーザーの jti には触らない", async () => {
      const { jti, token } = generateRefreshToken(1)
      await userRefreshTokenRepository.save(jti, 1, REFRESH_TTL_SECONDS)

      const res = await request(app).post("/api/admin/auth/refresh").send({ refresh_token: token })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await userRefreshTokenRepository.findUserId(jti)).toBe(1)
      expect(await testRedis.keys("admin_refresh_token*")).toEqual([])
    })

    it("payload が admin の形でも、一般ユーザーの鍵で署名された refresh token は 401", async () => {
      const { admin } = await createTestAdmin()
      const jti = "forged-jti"
      const token = jwt.sign({ adminId: admin.id, jti }, process.env.JWT_REFRESH_SECRET!, { expiresIn: "7d" })
      await adminRefreshTokenRepository.save(jti, admin.id, REFRESH_TTL_SECONDS)

      const res = await request(app).post("/api/admin/auth/refresh").send({ refresh_token: token })

      expect(res.status).toBe(401)
      expect(await adminRefreshTokenRepository.findUserId(jti)).toBe(admin.id)
    })

    it("admins から消された admin の refresh token は 401 で、その jti を消す", async () => {
      const { admin } = await createTestAdmin()
      const { jti, token } = generateAdminRefreshToken(admin.id)
      await adminRefreshTokenRepository.save(jti, admin.id, REFRESH_TTL_SECONDS)
      await testDb.delete(admins).where(eq(admins.id, admin.id))

      const res = await request(app).post("/api/admin/auth/refresh").send({ refresh_token: token })

      expect(res.status).toBe(401)
      expect(await adminRefreshTokenRepository.findUserId(jti)).toBeNull()
      expect(await testRedis.keys("admin_refresh_token_rotated:*")).toEqual([])
    })

    it("refresh_token が無ければ 400", async () => {
      const res = await request(app).post("/api/admin/auth/refresh").send({})

      expect(res.status).toBe(400)
    })
  })
})
