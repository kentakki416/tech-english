import request from "supertest"

import { AdminAuthLogoutController } from "../../../../src/controller/admin/auth/logout"
import { generateAdminRefreshToken } from "../../../../src/lib/admin-jwt"
import { generateRefreshToken } from "../../../../src/lib/jwt"
import { IoRedisRefreshTokenRepository } from "../../../../src/repository/redis"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestRedis, disconnectTestDb, disconnectTestRedis, testRedis } from "../../setup"

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7

const adminRefreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis, "admin_refresh_token")
const userRefreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis)

const app = createTestApp()

mountAdminApi(app, adminRouter({
  auth: { logout: new AdminAuthLogoutController(adminRefreshTokenRepository) },
}))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestRedis()
})

afterAll(async () => {
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/auth/logout", () => {
  describe("正常系", () => {
    it("access token なしでも、admin の refresh token で jti を無効にできる", async () => {
      const { jti, token } = generateAdminRefreshToken(3)
      await adminRefreshTokenRepository.save(jti, 3, REFRESH_TTL_SECONDS)

      const res = await request(app).post("/api/admin/auth/logout").send({ refresh_token: token })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: "OK" })
      expect(await adminRefreshTokenRepository.findUserId(jti)).toBeNull()
    })
  })

  describe("異常系", () => {
    it("一般ユーザーの refresh token でも 200（冪等）で、どの jti も残る", async () => {
      const { jti: userJti, token } = generateRefreshToken(1)
      await userRefreshTokenRepository.save(userJti, 1, REFRESH_TTL_SECONDS)
      /**
       * 一般ユーザーの鍵でも検証が通ってしまうと消えるよう、同じ jti を admin のキーにも置いておく
       */
      await adminRefreshTokenRepository.save(userJti, 1, REFRESH_TTL_SECONDS)
      const { jti: adminJti } = generateAdminRefreshToken(3)
      await adminRefreshTokenRepository.save(adminJti, 3, REFRESH_TTL_SECONDS)

      const res = await request(app).post("/api/admin/auth/logout").send({ refresh_token: token })

      expect(res.status).toBe(200)
      expect(await userRefreshTokenRepository.findUserId(userJti)).toBe(1)
      expect(await adminRefreshTokenRepository.findUserId(userJti)).toBe(1)
      expect(await adminRefreshTokenRepository.findUserId(adminJti)).toBe(3)
    })
  })
})
