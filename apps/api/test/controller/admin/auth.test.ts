import jwt from "jsonwebtoken"
import request from "supertest"

import { LoggerFactory } from "@repo/logger"

import { UserGetController } from "../../../src/controller/user/get"
import { generateAdminRefreshToken } from "../../../src/lib/admin-jwt"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { adminRouter, mountAdminApi } from "../../../src/routes/admin-router"
import { userRouter } from "../../../src/routes/user-router"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const userRepository = new DrizzleUserRepository(testDb)

const app = createTestApp()

/**
 * コントローラーを渡さないのでルートは無く、admin の認証を通れば Express の 404 になる
 */
mountAdminApi(app, adminRouter({}))
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

describe("/api/admin/*（mountAdminApi の adminAuthMiddleware）", () => {
  describe("正常系", () => {
    it("admin の access token なら認証を通過し、ルートが無いので 404 を返す", async () => {
      const { token } = await createTestAdmin()

      const res = await request(app)
        .get("/api/admin/passage")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
    })

    it("大文字小文字の違うパスでも admin の access token なら認証を通過する", async () => {
      const { token } = await createTestAdmin()

      const res = await request(app)
        .get("/API/Admin/passage")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
    })
  })

  describe("異常系", () => {
    it("Authorization が無ければ 401 とエラーボディを返す", async () => {
      const res = await request(app).get("/api/admin/passage")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("一般ユーザーの有効な access token では 401 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .get("/api/admin/passage")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("admin の refresh token を access token として使うと 401 を返す", async () => {
      const { admin } = await createTestAdmin()
      const { token } = generateAdminRefreshToken(admin.id)

      const res = await request(app)
        .get("/api/admin/passage")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
    })

    it("一般ユーザーの鍵で { adminId } を署名したトークンは 401 を返す", async () => {
      const { admin } = await createTestAdmin()
      const token = jwt.sign({ adminId: admin.id }, process.env.JWT_ACCESS_SECRET!, { expiresIn: "15m" })

      const res = await request(app)
        .get("/api/admin/passage")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
    })

    it.each(["/API/ADMIN/passage", "/Api/Admin/passage"])(
      "一般ユーザーの access token では %s も 401 を返す（大文字小文字で認証をすり抜けない）",
      async (path) => {
        const { token } = await createTestUser()

        const res = await request(app).get(path).set("Authorization", `Bearer ${token}`)

        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      },
    )

    it("拒否したときは method と path を warn に残し、送られたトークンはログに出さない", async () => {
      const warn = vi.spyOn(LoggerFactory.getLogger(), "warn")
      const wrongToken = "wrong-admin-token-that-must-not-be-logged"

      const res = await request(app)
        .get("/api/admin/passage?status=draft")
        .set("Authorization", `Bearer ${wrongToken}`)

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

describe("authMiddleware（一般ユーザーの認証）と /api/admin の境界", () => {
  describe("異常系", () => {
    it("/api/user は一般ユーザーの access token が無ければ 401 を返す", async () => {
      const res = await request(app).get("/api/user")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("/api/admin-foo はセグメント境界で一致しないため一般ユーザーの認証が掛かり、admin の access token では 401 を返す（境界値）", async () => {
      const { token } = await createTestAdmin()

      const res = await request(app)
        .get("/api/admin-foo")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
