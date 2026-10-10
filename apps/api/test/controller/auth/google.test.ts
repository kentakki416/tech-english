import request from "supertest"

import { and, authAccounts, eq, users } from "@repo/db"

import { GoogleUserInfo, IGoogleOAuthClient } from "../../../src/client/google-oauth"
import { AuthGoogleController } from "../../../src/controller/auth/google"
import { verifyRefreshToken } from "../../../src/lib/jwt"
import { DrizzleAuthAccountRepository } from "../../../src/repository/drizzle/auth-account-repository"
import { DrizzleTransactionRunner } from "../../../src/repository/drizzle/transaction-runner"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { IoRedisRefreshTokenRepository } from "../../../src/repository/redis"
import { authRouter } from "../../../src/routes/auth-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testDb,
  testRedis,
} from "../setup"

const mockGetUserInfo = vi.fn<(_0: string, _1: string) => Promise<GoogleUserInfo>>()
const mockGoogleOAuthClient: IGoogleOAuthClient = {
  getUserInfo: mockGetUserInfo,
}

const authAccountRepository = new DrizzleAuthAccountRepository(testDb)
const userRepository = new DrizzleUserRepository(testDb)
const transactionRunner = new DrizzleTransactionRunner(testDb)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis)

const app = createTestApp()

const authGoogleController = new AuthGoogleController(
  authAccountRepository,
  userRepository,
  refreshTokenRepository,
  transactionRunner,
  mockGoogleOAuthClient,
)

app.use("/api/auth", authRouter({ google: authGoogleController }))
attachUnhandledExceptionHandler(app)

const REDIRECT_URI = "http://localhost:3000/api/auth/callback/google"

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

describe("POST /api/auth/google", () => {
  it("新規ユーザーの場合、200 と Access/Refresh Token を返し、DB にユーザーが作成され Redis に Refresh Token が保存される", async () => {
    mockGetUserInfo.mockResolvedValue({
      email: "new@example.com",
      id: "google-456",
      name: "New User",
      picture: "https://example.com/new-avatar.jpg",
    })

    const res = await request(app)
      .post("/api/auth/google")
      .send({ code: "auth-code", redirect_uri: REDIRECT_URI })

    /** API レスポンス契約を全フィールドで検証 */
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      access_token: expect.any(String),
      is_new_user: true,
      refresh_token: expect.any(String),
      user: {
        avatar_url: "https://example.com/new-avatar.jpg",
        created_at: expect.any(String),
        email: "new@example.com",
        id: expect.any(Number),
        name: "New User",
      },
    })

    /** Postgres に User が作成されている（id/timestamp は省略） */
    const [createdUser] = await testDb.select().from(users).where(eq(users.email, "new@example.com"))
    expect(createdUser).toMatchObject({
      avatarUrl: "https://example.com/new-avatar.jpg",
      email: "new@example.com",
      name: "New User",
    })

    /** Postgres に AuthAccount が作成され、User と同じトランザクションで紐付いている */
    const [createdAuthAccount] = await testDb
      .select()
      .from(authAccounts)
      .where(and(eq(authAccounts.provider, "google"), eq(authAccounts.providerAccountId, "google-456")))
    expect(createdAuthAccount).toMatchObject({
      provider: "google",
      providerAccountId: "google-456",
      userId: createdUser.id,
    })

    /** Redis に Refresh Token が保存され、userId が紐付いている */
    const payload = verifyRefreshToken(res.body.refresh_token)
    expect(payload).not.toBeNull()
    expect(await refreshTokenRepository.findUserId(payload!.jti)).toBe(createdUser.id)
  })

  it("既存ユーザーの場合、200 と is_new_user=false で Token を返し Redis に新しい Refresh Token が保存される", async () => {
    const [user] = await testDb
      .insert(users)
      .values({
        avatarUrl: "https://example.com/avatar.jpg",
        email: "test@example.com",
        name: "Test User",
      })
      .returning()
    await testDb.insert(authAccounts).values({
      provider: "google",
      providerAccountId: "google-123",
      userId: user.id,
    })

    mockGetUserInfo.mockResolvedValue({
      email: "test@example.com",
      id: "google-123",
      name: "Test User",
      picture: "https://example.com/avatar.jpg",
    })

    const res = await request(app)
      .post("/api/auth/google")
      .send({ code: "auth-code", redirect_uri: REDIRECT_URI })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      access_token: expect.any(String),
      is_new_user: false,
      refresh_token: expect.any(String),
      user: {
        avatar_url: "https://example.com/avatar.jpg",
        created_at: expect.any(String),
        email: "test@example.com",
        id: user.id,
        name: "Test User",
      },
    })

    const payload = verifyRefreshToken(res.body.refresh_token)
    expect(payload).not.toBeNull()
    expect(await refreshTokenRepository.findUserId(payload!.jti)).toBe(user.id)
  })

  it("code が無い場合、400 を返す", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ redirect_uri: REDIRECT_URI })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("redirect_uri が URL でない場合、400 を返す", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ code: "auth-code", redirect_uri: "not-a-url" })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("Google 認証エラー時、グローバルエラーハンドラが 500 を返す", async () => {
    mockGetUserInfo.mockRejectedValue(new Error("Google authentication failed"))

    const res = await request(app)
      .post("/api/auth/google")
      .send({ code: "invalid-code", redirect_uri: REDIRECT_URI })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 500 })
  })
})
