import request from "supertest"

import { LoggerFactory } from "@repo/logger"

import { UserGetController } from "../../../src/controller/user/get"
import { env } from "../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../src/middleware/admin-auth"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { adminRouter } from "../../../src/routes/admin-router"
import { userRouter } from "../../../src/routes/user-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const userRepository = new DrizzleUserRepository(testDb)

const app = createTestApp()

/**
 * admin のルートはまだ無いので、認証を通れば Express の 404 になる
 */
app.use("/api/admin", adminRouter())
app.use("/api/user", userRouter({ get: new UserGetController(userRepository) }))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("/api/admin/*（adminAuthMiddleware）", () => {
  describe("正常系", () => {
    it("正しい X-Admin-Token なら認証を通過し、ルートが無いので 404 を返す", async () => {
      const res = await request(app)
        .get("/api/admin/passage")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(404)
    })

    it("Bearer トークンが無くても 401 にならない（ユーザーの JWT 認証の対象外）", async () => {
      const res = await request(app)
        .post("/api/admin/passage/1/publish")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).not.toBe(401)
      expect(res.status).toBe(404)
    })
  })

  describe("異常系", () => {
    it("X-Admin-Token が無ければ 401 とエラーボディを返す", async () => {
      const res = await request(app).get("/api/admin/passage")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("X-Admin-Token が違えば 401 とエラーボディを返す", async () => {
      const res = await request(app)
        .get("/api/admin/passage")
        .set(ADMIN_TOKEN_HEADER, `${env.ADMIN_API_TOKEN}x`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("X-Admin-Token が空文字なら 401 とエラーボディを返す", async () => {
      const res = await request(app)
        .get("/api/admin/passage")
        .set(ADMIN_TOKEN_HEADER, "")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("ユーザーの有効な JWT だけを付けても 401 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .get("/api/admin/passage")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("拒否したときは method と path を warn に残し、送られたトークンはログに出さない", async () => {
      const warn = vi.spyOn(LoggerFactory.getLogger(), "warn")
      const wrongToken = "wrong-admin-token-that-must-not-be-logged"

      const res = await request(app)
        .get("/api/admin/passage?status=draft")
        .set(ADMIN_TOKEN_HEADER, wrongToken)

      expect(res.status).toBe(401)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(expect.any(String), {
        method: "GET",
        path: "/api/admin/passage",
      })
      expect(JSON.stringify(warn.mock.calls)).not.toContain(wrongToken)
    })
  })
})

describe("PUBLIC_PATHS への /api/admin の追加", () => {
  describe("異常系", () => {
    it("既存の /api/user は JWT が無ければ引き続き 401 を返す", async () => {
      const res = await request(app).get("/api/user")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("/api/admin-foo はセグメント境界で一致しないため、JWT が無ければ 401 を返す（境界値）", async () => {
      const res = await request(app)
        .get("/api/admin-foo")
        .set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
