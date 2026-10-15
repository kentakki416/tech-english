import express, { type Request } from "express"
import jwt from "jsonwebtoken"
import request from "supertest"

import { generateAccessToken, generateRefreshToken } from "../../src/lib/jwt"
import { forTesting } from "../../src/middleware/rate-limit"

const { createApiRateLimiter, resolveRateLimitKey } = forTesting

/**
 * 1 分あたりの上限（テストでは小さくして、上限の前後を確かめる）
 */
const LIMIT = 2
const CLIENT_IP = "203.0.113.1"
const OTHER_CLIENT_IP = "203.0.113.2"
const USER_ID = 1
const OTHER_USER_ID = 2

/**
 * 本番と同じく trust proxy 1・express.json() の後ろにレート制限を置く。X-Forwarded-For でクライアントの IP を決める
 */
const buildApp = (): express.Express => {
  const app = express()
  app.set("trust proxy", 1)
  app.use(express.json())
  app.use(createApiRateLimiter(LIMIT))
  app.get("/api/test", (_req, res) => {
    res.status(200).json({ ok: true })
  })
  app.post("/api/test", (_req, res) => {
    res.status(200).json({ ok: true })
  })
  app.post("/api/auth/refresh", (_req, res) => {
    res.status(200).json({ ok: true })
  })
  return app
}

const sendGet = async (app: express.Express, options: { authorization?: string; ip?: string } = {}): Promise<number> => {
  const req = request(app).get("/api/test").set("X-Forwarded-For", options.ip ?? CLIENT_IP)
  if (options.authorization !== undefined) req.set("Authorization", options.authorization)
  const res = await req
  return res.status
}

const sendRefresh = async (app: express.Express, refreshToken: string, path = "/api/auth/refresh"): Promise<number> => {
  const res = await request(app).post(path).set("X-Forwarded-For", CLIENT_IP).send({ refresh_token: refreshToken })
  return res.status
}

const exhaustIpLimit = async (app: express.Express): Promise<void> => {
  for (let i = 0; i < LIMIT; i++) {
    expect(await sendGet(app)).toBe(200)
  }
}

/**
 * 期限切れの access token（署名は正しい）
 */
const buildExpiredAccessToken = (userId: number): string =>
  jwt.sign({ exp: Math.floor(Date.now() / 1000) - 1, userId }, process.env.JWT_ACCESS_SECRET as string)

/**
 * resolveRateLimitKey に渡す最小のリクエスト
 */
const buildRequest = (overrides: Partial<Pick<Request, "body" | "headers" | "method" | "path">> = {}): Request =>
  ({
    body: undefined,
    headers: {},
    ip: CLIENT_IP,
    method: "GET",
    path: "/api/test",
    ...overrides,
  }) as unknown as Request

describe("resolveRateLimitKey", () => {
  describe("正常系", () => {
    it("検証できる access token があれば user:<userId> を返す", () => {
      const key = resolveRateLimitKey(buildRequest({ headers: { authorization: `Bearer ${generateAccessToken(USER_ID)}` } }))

      expect(key).toBe(`user:${USER_ID}`)
    })

    it("POST /api/auth/refresh の body の refresh token が検証できれば user:<userId> を返す", () => {
      const { token } = generateRefreshToken(USER_ID)
      const key = resolveRateLimitKey(buildRequest({ body: { refresh_token: token }, method: "POST", path: "/api/auth/refresh" }))

      expect(key).toBe(`user:${USER_ID}`)
    })

    it("トークンが無ければ ip:<IP> を返す", () => {
      expect(resolveRateLimitKey(buildRequest())).toBe(`ip:${CLIENT_IP}`)
    })
  })

  describe("異常系", () => {
    it("署名の合わない access token なら ip:<IP> を返す", () => {
      expect(resolveRateLimitKey(buildRequest({ headers: { authorization: "Bearer invalid.token.value" } }))).toBe(`ip:${CLIENT_IP}`)
    })

    it("期限切れの access token なら ip:<IP> を返す（境界値）", () => {
      const key = resolveRateLimitKey(buildRequest({ headers: { authorization: `Bearer ${buildExpiredAccessToken(USER_ID)}` } }))

      expect(key).toBe(`ip:${CLIENT_IP}`)
    })

    it("Bearer で始まらない Authorization なら ip:<IP> を返す", () => {
      expect(resolveRateLimitKey(buildRequest({ headers: { authorization: generateAccessToken(USER_ID) } }))).toBe(`ip:${CLIENT_IP}`)
    })

    it("refresh token を Authorization に付けても access token としては扱わず ip:<IP> を返す", () => {
      const { token } = generateRefreshToken(USER_ID)

      expect(resolveRateLimitKey(buildRequest({ headers: { authorization: `Bearer ${token}` } }))).toBe(`ip:${CLIENT_IP}`)
    })

    it("refresh 以外のパスの body の refresh token は見ず ip:<IP> を返す", () => {
      const { token } = generateRefreshToken(USER_ID)
      const key = resolveRateLimitKey(buildRequest({ body: { refresh_token: token }, method: "POST", path: "/api/test" }))

      expect(key).toBe(`ip:${CLIENT_IP}`)
    })

    it("POST /api/auth/refresh の body が無ければ ip:<IP> を返す", () => {
      expect(resolveRateLimitKey(buildRequest({ method: "POST", path: "/api/auth/refresh" }))).toBe(`ip:${CLIENT_IP}`)
    })
  })
})

describe("createApiRateLimiter", () => {
  describe("正常系", () => {
    it("同じ IP の別のユーザーは別に数える", async () => {
      const app = buildApp()
      const userAuthorization = `Bearer ${generateAccessToken(USER_ID)}`

      for (let i = 0; i < LIMIT; i++) {
        expect(await sendGet(app, { authorization: userAuthorization })).toBe(200)
      }

      expect(await sendGet(app, { authorization: userAuthorization })).toBe(429)
      expect(await sendGet(app, { authorization: `Bearer ${generateAccessToken(OTHER_USER_ID)}` })).toBe(200)
    })

    it("検証できる access token のリクエストは IP の上限に含めない", async () => {
      const app = buildApp()

      await exhaustIpLimit(app)

      expect(await sendGet(app)).toBe(429)
      expect(await sendGet(app, { authorization: `Bearer ${generateAccessToken(USER_ID)}` })).toBe(200)
    })

    it("refresh の body の refresh token が検証できれば、IP ではなくそのユーザーで数える", async () => {
      const app = buildApp()

      await exhaustIpLimit(app)

      expect(await sendRefresh(app, generateRefreshToken(USER_ID).token)).toBe(200)
    })

    it("refresh token と access token が同じユーザーなら同じ上限で数える", async () => {
      const app = buildApp()
      const userAuthorization = `Bearer ${generateAccessToken(USER_ID)}`

      for (let i = 0; i < LIMIT; i++) {
        expect(await sendGet(app, { authorization: userAuthorization })).toBe(200)
      }

      expect(await sendRefresh(app, generateRefreshToken(USER_ID).token)).toBe(429)
      expect(await sendRefresh(app, generateRefreshToken(OTHER_USER_ID).token)).toBe(200)
    })

    it("トークンが無ければ IP ごとに数える（IP が違えば別に数える）", async () => {
      const app = buildApp()

      await exhaustIpLimit(app)

      expect(await sendGet(app, { ip: OTHER_CLIENT_IP })).toBe(200)
    })
  })

  describe("異常系", () => {
    it("トークンが無ければ IP で数え、上限を超えたら 429 を返す（境界値）", async () => {
      const app = buildApp()

      await exhaustIpLimit(app)

      expect(await sendGet(app)).toBe(429)
    })

    it("署名の合わない access token はトークン無しと同じ IP の上限で数える", async () => {
      const app = buildApp()

      await exhaustIpLimit(app)

      expect(await sendGet(app, { authorization: "Bearer invalid.token.value" })).toBe(429)
    })

    it("不正なトークンを変えながら送っても IP の上限で止まる", async () => {
      const app = buildApp()

      for (let i = 0; i < LIMIT; i++) {
        expect(await sendGet(app, { authorization: `Bearer invalid-${i}` })).toBe(200)
      }

      expect(await sendGet(app, { authorization: "Bearer invalid-last" })).toBe(429)
    })

    it("期限切れの access token は IP の上限で数える", async () => {
      const app = buildApp()

      await exhaustIpLimit(app)

      expect(await sendGet(app, { authorization: `Bearer ${buildExpiredAccessToken(USER_ID)}` })).toBe(429)
    })

    it("refresh の body の refresh token が不正なら IP の上限で数える", async () => {
      const app = buildApp()

      await exhaustIpLimit(app)

      expect(await sendRefresh(app, "invalid.refresh.token")).toBe(429)
    })

    it("refresh 以外のパスの body の refresh token では IP の上限を逃れられない", async () => {
      const app = buildApp()

      await exhaustIpLimit(app)

      expect(await sendRefresh(app, generateRefreshToken(USER_ID).token, "/api/test")).toBe(429)
    })
  })
})
