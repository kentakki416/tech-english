import request from "supertest"

import { and, authAccounts, eq, users } from "@repo/db"

import { GetGitHubUserInfoInput, GitHubUserInfo, IGitHubOAuthClient } from "../../../src/client/github-oauth"
import { AuthGitHubController } from "../../../src/controller/auth/github"
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

/**
 * 外部 SaaS（GitHub）だけをモックする。DB / Redis は実物を使う
 */
const mockGetUserInfo = vi.fn<(_0: GetGitHubUserInfoInput) => Promise<GitHubUserInfo | null>>()
const mockGitHubOAuthClient: IGitHubOAuthClient = {
  getUserInfo: mockGetUserInfo,
}

const authAccountRepository = new DrizzleAuthAccountRepository(testDb)
const userRepository = new DrizzleUserRepository(testDb)
const transactionRunner = new DrizzleTransactionRunner(testDb)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis)

const app = createTestApp()

const authGitHubController = new AuthGitHubController(
  authAccountRepository,
  userRepository,
  refreshTokenRepository,
  transactionRunner,
  mockGitHubOAuthClient,
)

app.use("/api/auth", authRouter({ github: authGitHubController }))
attachUnhandledExceptionHandler(app)

const REDIRECT_URI = "http://localhost:3000/api/auth/callback/github"
const CODE_VERIFIER = "v".repeat(43)

const GITHUB_USER: GitHubUserInfo = {
  id: "12345",
  avatarUrl: "https://avatars.githubusercontent.com/u/12345",
  email: "octocat@example.com",
  login: "octocat",
  name: "The Octocat",
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

describe("POST /api/auth/github", () => {
  describe("正常系", () => {
    it("新規ユーザーの場合、200 と Token を返し、timezone 付きの User と provider=github の AuthAccount を作成して Redis に jti を保存する", async () => {
      mockGetUserInfo.mockResolvedValue(GITHUB_USER)

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "auth-code", code_verifier: CODE_VERIFIER, redirect_uri: REDIRECT_URI, timezone: "America/New_York" })

      /** API レスポンス契約を全フィールドで検証 */
      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        access_token: expect.any(String),
        is_new_user: true,
        refresh_token: expect.any(String),
        user: {
          id: expect.any(Number),
          avatar_url: "https://avatars.githubusercontent.com/u/12345",
          email: "octocat@example.com",
          name: "The Octocat",
          timezone: "America/New_York",
          created_at: expect.any(String),
        },
      })
      expect(mockGetUserInfo).toHaveBeenCalledWith({
        code: "auth-code",
        codeVerifier: CODE_VERIFIER,
        redirectUri: REDIRECT_URI,
      })

      const [createdUser] = await testDb.select().from(users).where(eq(users.id, res.body.user.id))
      expect(createdUser).toMatchObject({
        avatarUrl: "https://avatars.githubusercontent.com/u/12345",
        email: "octocat@example.com",
        name: "The Octocat",
        timezone: "America/New_York",
      })

      const [createdAuthAccount] = await testDb
        .select()
        .from(authAccounts)
        .where(and(eq(authAccounts.provider, "github"), eq(authAccounts.providerAccountId, "12345")))
      expect(createdAuthAccount).toMatchObject({
        provider: "github",
        providerAccountId: "12345",
        userId: createdUser.id,
      })

      const payload = verifyRefreshToken(res.body.refresh_token)
      expect(payload).not.toBeNull()
      expect(await refreshTokenRepository.findUserId(payload!.jti)).toBe(createdUser.id)
    })

    it("既存ユーザーの場合、200 と is_new_user=false を返し、DB の名前とアイコンが GitHub の値に変わる", async () => {
      const [user] = await testDb
        .insert(users)
        .values({
          avatarUrl: "https://example.com/old-avatar.png",
          email: "octocat@example.com",
          name: "Old Name",
          timezone: "UTC",
        })
        .returning()
      await testDb.insert(authAccounts).values({ provider: "github", providerAccountId: "12345", userId: user.id })
      mockGetUserInfo.mockResolvedValue(GITHUB_USER)

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "auth-code", code_verifier: CODE_VERIFIER, redirect_uri: REDIRECT_URI, timezone: "America/New_York" })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        access_token: expect.any(String),
        is_new_user: false,
        refresh_token: expect.any(String),
        user: {
          id: user.id,
          avatar_url: "https://avatars.githubusercontent.com/u/12345",
          email: "octocat@example.com",
          name: "The Octocat",
          /** timezone は初回作成時だけ使うので、既存ユーザーの値は変わらない */
          timezone: "UTC",
          created_at: expect.any(String),
        },
      })

      const [updatedUser] = await testDb.select().from(users).where(eq(users.id, user.id))
      expect(updatedUser).toMatchObject({
        avatarUrl: "https://avatars.githubusercontent.com/u/12345",
        email: "octocat@example.com",
        name: "The Octocat",
        timezone: "UTC",
      })
      expect(await testDb.select().from(users)).toHaveLength(1)

      const payload = verifyRefreshToken(res.body.refresh_token)
      expect(payload).not.toBeNull()
      expect(await refreshTokenRepository.findUserId(payload!.jti)).toBe(user.id)
    })

    it("同じメールの Google ユーザーがいる場合、email=null の別ユーザーを作り、既存ユーザーは変わらない", async () => {
      const [googleUser] = await testDb
        .insert(users)
        .values({ avatarUrl: "https://example.com/google.png", email: "octocat@example.com", name: "Google User" })
        .returning()
      await testDb.insert(authAccounts).values({ provider: "google", providerAccountId: "google-1", userId: googleUser.id })
      mockGetUserInfo.mockResolvedValue(GITHUB_USER)

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "auth-code", code_verifier: CODE_VERIFIER, redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(200)
      expect(res.body.is_new_user).toBe(true)
      expect(res.body.user.id).not.toBe(googleUser.id)
      expect(res.body.user.email).toBeNull()

      const [newUser] = await testDb.select().from(users).where(eq(users.id, res.body.user.id))
      expect(newUser).toMatchObject({ email: null, name: "The Octocat" })

      const [unchangedGoogleUser] = await testDb.select().from(users).where(eq(users.id, googleUser.id))
      expect(unchangedGoogleUser).toEqual(googleUser)

      const [githubAccount] = await testDb.select().from(authAccounts).where(eq(authAccounts.provider, "github"))
      expect(githubAccount).toMatchObject({ providerAccountId: "12345", userId: newUser.id })
    })

    it("timezone が不正な値（Mars/Base）の場合、ログインは成功し timezone は既定値の Asia/Tokyo になる", async () => {
      mockGetUserInfo.mockResolvedValue(GITHUB_USER)

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "auth-code", code_verifier: CODE_VERIFIER, redirect_uri: REDIRECT_URI, timezone: "Mars/Base" })

      expect(res.status).toBe(200)
      expect(res.body.user.timezone).toBe("Asia/Tokyo")

      const [createdUser] = await testDb.select().from(users).where(eq(users.id, res.body.user.id))
      expect(createdUser.timezone).toBe("Asia/Tokyo")
    })

    it("code_verifier が上限の 128 文字の場合、200 を返す", async () => {
      mockGetUserInfo.mockResolvedValue(GITHUB_USER)

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "auth-code", code_verifier: "v".repeat(128), redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(200)
    })
  })

  describe("異常系", () => {
    it.each([
      ["code_verifier が無い", { code: "auth-code", redirect_uri: REDIRECT_URI }],
      ["code_verifier が 42 文字", { code: "auth-code", code_verifier: "v".repeat(42), redirect_uri: REDIRECT_URI }],
      ["code_verifier が 129 文字", { code: "auth-code", code_verifier: "v".repeat(129), redirect_uri: REDIRECT_URI }],
      ["code が無い", { code_verifier: CODE_VERIFIER, redirect_uri: REDIRECT_URI }],
      ["redirect_uri が URL でない", { code: "auth-code", code_verifier: CODE_VERIFIER, redirect_uri: "not-a-url" }],
    ])("%s場合、400 を返し GitHub を呼ばない", async (_label, body) => {
      const res = await request(app).post("/api/auth/github").send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(mockGetUserInfo).not.toHaveBeenCalled()
    })

    it("getUserInfo が null（code が使えない）の場合、401 を返しユーザーも jti も作らない", async () => {
      mockGetUserInfo.mockResolvedValue(null)

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "expired-code", code_verifier: CODE_VERIFIER, redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await testDb.select().from(users)).toHaveLength(0)
      expect(await testRedis.dbsize()).toBe(0)
    })

    it("getUserInfo が throw した場合、グローバルエラーハンドラが 500 を返す", async () => {
      mockGetUserInfo.mockRejectedValue(new Error("GitHub is down"))

      const res = await request(app)
        .post("/api/auth/github")
        .send({ code: "auth-code", code_verifier: CODE_VERIFIER, redirect_uri: REDIRECT_URI })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 500 })
    })
  })
})
