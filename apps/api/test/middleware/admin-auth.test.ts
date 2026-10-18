import express, { Router } from "express"
import jwt from "jsonwebtoken"
import request from "supertest"

import { generateAdminAccessToken } from "../../src/lib/admin-jwt"
import { generateAccessToken } from "../../src/lib/jwt"
import { AdminAuthRequest } from "../../src/middleware/admin-auth"
import { authMiddleware } from "../../src/middleware/auth"
import { mountAdminApi } from "../../src/routes/admin-router"

/**
 * adminAuthMiddleware を通ったら adminId を返すだけの Router
 */
const echoRouter = Router()
echoRouter.all(/.*/, (req: AdminAuthRequest, res: express.Response) => {
  res.status(200).json({ adminId: req.adminId ?? null })
})

/**
 * 本番の index.ts と同じく、authMiddleware を全体に掛けてから mountAdminApi で mount する
 */
const app = express()
app.use(express.json())
app.use(authMiddleware)
mountAdminApi(app, echoRouter)

describe("adminAuthMiddleware", () => {
  describe("正常系", () => {
    it("admin の access token なら通し、req.adminId を入れる", async () => {
      const res = await request(app)
        .get("/api/admin/me")
        .set("Authorization", `Bearer ${generateAdminAccessToken(7)}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ adminId: 7 })
    })

    it.each([
      "/api/admin/auth/google",
      "/api/admin/auth/refresh",
      "/api/admin/auth/logout",
      "/api/admin/auth/dev-login",
      "/API/Admin/Auth/Google",
      "/api/admin/auth/google/",
      "/api/admin/AUTH/LOGOUT/",
    ])("ADMIN_PUBLIC_PATHS の %s はトークンなしで通す（大文字小文字と末尾の / の違いを含む）", async (path) => {
      const res = await request(app).post(path)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ adminId: null })
    })
  })

  describe("異常系", () => {
    it("トークンなしは 401", async () => {
      const res = await request(app).get("/api/admin/me")

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("一般ユーザーの access token は 401", async () => {
      const res = await request(app)
        .get("/api/admin/me")
        .set("Authorization", `Bearer ${generateAccessToken(1)}`)

      expect(res.status).toBe(401)
    })

    it("admin の鍵で署名されていても payload に adminId が無ければ 401", async () => {
      const token = jwt.sign({ userId: 1 }, process.env.JWT_ADMIN_ACCESS_SECRET!, { expiresIn: "15m" })

      const res = await request(app)
        .get("/api/admin/me")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
    })

    it("admin の鍵で署名されていても payload に jti があれば（refresh token の形なら）401", async () => {
      const token = jwt.sign({ adminId: 7, jti: "jti" }, process.env.JWT_ADMIN_ACCESS_SECRET!, { expiresIn: "15m" })

      const res = await request(app)
        .get("/api/admin/me")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
    })

    it("期限切れの admin の access token は 401", async () => {
      const token = jwt.sign({ adminId: 7 }, process.env.JWT_ADMIN_ACCESS_SECRET!, { expiresIn: -1 })

      const res = await request(app)
        .get("/api/admin/me")
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(401)
    })

    it.each(["/api/admin/auth/google/x", "/api/admin/auth/google-foo", "/api/admin/auth"])(
      "%s は公開のパスにしない（下の階層・文字を足したパス・上の階層）",
      async (path) => {
        const res = await request(app).post(path)

        expect(res.status).toBe(401)
      },
    )
  })
})
