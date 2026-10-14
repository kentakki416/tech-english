import request from "supertest"

import { AuthRefreshController } from "../../../src/controller/auth/refresh"
import { generateRefreshToken, verifyRefreshToken } from "../../../src/lib/jwt"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { IoRedisRefreshTokenRepository } from "../../../src/repository/redis"
import { authRouter } from "../../../src/routes/auth-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testDb,
  testRedis,
} from "../setup"

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7

const refreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis)
const userRepository = new DrizzleUserRepository(testDb)

const app = createTestApp()
const authRefreshController = new AuthRefreshController(refreshTokenRepository, userRepository)
app.use("/api/auth", authRouter({ refresh: authRefreshController }))
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

describe("POST /api/auth/refresh", () => {
  describe("正常系", () => {
    it("旧 jti が Redis から削除され、新 jti が保存される", async () => {
      const { user } = await createTestUser()
      const { jti: oldJti, token } = generateRefreshToken(user.id)
      await refreshTokenRepository.save(oldJti, user.id, REFRESH_TTL_SECONDS)

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: token })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
      })

      /** 旧 jti は Redis から削除されている */
      expect(await refreshTokenRepository.findUserId(oldJti)).toBeNull()

      /** 新 jti は Redis に保存されている */
      const newPayload = verifyRefreshToken(res.body.refresh_token)
      expect(newPayload).not.toBeNull()
      expect(await refreshTokenRepository.findUserId(newPayload!.jti)).toBe(user.id)
    })

    it("猶予（30 秒）の間に同じ Refresh Token をもう一度使うと、1 回目と同じペアを返し、新しく発行しない", async () => {
      const { user } = await createTestUser()
      const { jti, token } = generateRefreshToken(user.id)
      await refreshTokenRepository.save(jti, user.id, REFRESH_TTL_SECONDS)

      const first = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: token })
      expect(first.status).toBe(200)

      const second = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: token })
      expect(second.status).toBe(200)
      expect(second.body).toEqual(first.body)

      /**
       * 猶予の記録は 30 秒以内の TTL で残る
       */
      const ttl = await testRedis.ttl(`refresh_token_rotated:${jti}`)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(30)
      /**
       * Redis に残る refresh token は 1 回目で発行したものだけ
       */
      const firstPayload = verifyRefreshToken(first.body.refresh_token)
      expect(await testRedis.keys("refresh_token:*")).toEqual([`refresh_token:${firstPayload!.jti}`])
    })
  })

  describe("異常系", () => {
    it("猶予を過ぎてから同じ Refresh Token を使うと 401（再利用検知）", async () => {
      const { user } = await createTestUser()
      const { jti, token } = generateRefreshToken(user.id)
      await refreshTokenRepository.save(jti, user.id, REFRESH_TTL_SECONDS)

      const first = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: token })
      expect(first.status).toBe(200)

      /**
       * 猶予の記録の TTL が切れた状態にする
       */
      await testRedis.del(`refresh_token_rotated:${jti}`)

      const second = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: token })
      expect(second.status).toBe(401)
      expect(second.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("猶予の間でも、ユーザーが削除済みなら 401 を返す", async () => {
      const { user } = await createTestUser()
      const { jti, token } = generateRefreshToken(user.id)
      await refreshTokenRepository.save(jti, user.id, REFRESH_TTL_SECONDS)

      const first = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: token })
      expect(first.status).toBe(200)

      await userRepository.deleteById(user.id)

      const second = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: token })
      expect(second.status).toBe(401)
      expect(second.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("Refresh Token が改ざんされている場合、401 を返す", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: "invalid.refresh.token" })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("Redis に jti が無い場合（再利用検知）、401 を返す", async () => {
      const { user } = await createTestUser()
      const { token } = generateRefreshToken(user.id)

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: token })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("ユーザーが存在しない場合（削除済みユーザーの端末）、401 を返し、その jti を Redis から消す", async () => {
      const userId = 999999
      const { jti, token } = generateRefreshToken(userId)
      await refreshTokenRepository.save(jti, userId, REFRESH_TTL_SECONDS)

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: token })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await refreshTokenRepository.findUserId(jti)).toBeNull()
      /** 新しい token は発行・保存されない（Redis に残るキーが無い） */
      expect(await testRedis.keys("refresh_token:*")).toEqual([])
    })

    it("refresh_token が無い場合、400 を返す", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({})

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
    })
  })
})
