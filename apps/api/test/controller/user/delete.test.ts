import request from "supertest"

import { and, authAccounts, eq, users } from "@repo/db"

import { GetGitHubUserInfoInput, GitHubUserInfo, IGitHubOAuthClient } from "../../../src/client/github-oauth"
import { AuthGitHubController } from "../../../src/controller/auth/github"
import { AuthRefreshController } from "../../../src/controller/auth/refresh"
import { UserDeleteController } from "../../../src/controller/user/delete"
import { UserGetController } from "../../../src/controller/user/get"
import { UserUpdateController } from "../../../src/controller/user/update"
import { generateRefreshToken } from "../../../src/lib/jwt"
import { DrizzleAuthAccountRepository } from "../../../src/repository/drizzle/auth-account-repository"
import { DrizzleTransactionRunner } from "../../../src/repository/drizzle/transaction-runner"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { IoRedisRefreshTokenRepository } from "../../../src/repository/redis"
import { authRouter } from "../../../src/routes/auth-router"
import { userRouter } from "../../../src/routes/user-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testDb,
  testRedis,
} from "../setup"
import { countUserOwnedRows, seedUserOwnedData, USER_OWNED_TABLES } from "../user-owned-data"

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

app.use("/api/auth", authRouter({
  github: new AuthGitHubController(
    authAccountRepository,
    userRepository,
    refreshTokenRepository,
    transactionRunner,
    mockGitHubOAuthClient,
  ),
  refresh: new AuthRefreshController(refreshTokenRepository, userRepository),
}))
app.use("/api/user", userRouter({
  delete: new UserDeleteController(userRepository, refreshTokenRepository),
  get: new UserGetController(userRepository),
  update: new UserUpdateController(userRepository),
}))
attachUnhandledExceptionHandler(app)

const CONFIRMATION = "delete my account"
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7

const GITHUB_USER: GitHubUserInfo = {
  id: "12345",
  avatarUrl: "https://avatars.githubusercontent.com/u/12345",
  email: "octocat@example.com",
  login: "octocat",
  name: "The Octocat",
}

/**
 * ユーザーの refresh token を発行して Redis に保存する（ログイン済みの端末を 1 台増やす）
 */
const createRefreshToken = async (userId: number): Promise<{ jti: string; token: string }> => {
  const refreshToken = generateRefreshToken(userId)
  await refreshTokenRepository.save(refreshToken.jti, userId, REFRESH_TTL_SECONDS)
  return refreshToken
}

const hasUserRow = async (userId: number): Promise<boolean> =>
  (await testDb.$count(users, eq(users.id, userId))) > 0

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

describe("DELETE /api/user", () => {
  describe("正常系", () => {
    it("204 でボディが空。対象ユーザーと関連データがすべて消え、別のユーザーのデータは残る", async () => {
      const { token, user } = await createTestUser({ email: "target@example.com" })
      const { user: otherUser } = await createTestUser({ email: "other@example.com" })
      await seedUserOwnedData(user.id)
      await seedUserOwnedData(otherUser.id)

      const targetRowsBefore = await countUserOwnedRows(user.id)
      const otherRowsBefore = await countUserOwnedRows(otherUser.id)
      /** 関連データが全テーブルに入っていること（入っていないと消えたことを確かめられない） */
      for (const table of USER_OWNED_TABLES) {
        expect(targetRowsBefore[table.tableName]).toBeGreaterThan(0)
      }

      const res = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ confirmation: CONFIRMATION })

      expect(res.status).toBe(204)
      expect(res.text).toBe("")

      expect(await hasUserRow(user.id)).toBe(false)
      expect(await countUserOwnedRows(user.id)).toEqual(
        Object.fromEntries(USER_OWNED_TABLES.map((table) => [table.tableName, 0])),
      )

      expect(await hasUserRow(otherUser.id)).toBe(true)
      expect(await countUserOwnedRows(otherUser.id)).toEqual(otherRowsBefore)
    })

    it("refresh_token を渡すと、Redis からその jti が消える", async () => {
      const { token, user } = await createTestUser()
      const { jti, token: refreshToken } = await createRefreshToken(user.id)

      const res = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ confirmation: CONFIRMATION, refresh_token: refreshToken })

      expect(res.status).toBe(204)
      expect(await refreshTokenRepository.findUserId(jti)).toBeNull()
      expect(await hasUserRow(user.id)).toBe(false)
    })

    it("refresh_token を渡さなくても 204 でユーザーが消える（Redis の jti は refresh で使われたときに消える）", async () => {
      const { token, user } = await createTestUser()
      const { jti } = await createRefreshToken(user.id)

      const res = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ confirmation: CONFIRMATION })

      expect(res.status).toBe(204)
      expect(await hasUserRow(user.id)).toBe(false)
      expect(await refreshTokenRepository.findUserId(jti)).toBe(user.id)
    })

    it("他人の refresh_token を渡しても、その jti は消えない", async () => {
      const { token } = await createTestUser({ email: "target@example.com" })
      const { user: otherUser } = await createTestUser({ email: "other@example.com" })
      const { jti, token: otherRefreshToken } = await createRefreshToken(otherUser.id)

      const res = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ confirmation: CONFIRMATION, refresh_token: otherRefreshToken })

      expect(res.status).toBe(204)
      expect(await refreshTokenRepository.findUserId(jti)).toBe(otherUser.id)
      expect(await hasUserRow(otherUser.id)).toBe(true)
    })

    it("2 回続けて呼ぶと、2 回とも 204 を返す", async () => {
      const { token, user } = await createTestUser()

      const first = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ confirmation: CONFIRMATION })
      const second = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ confirmation: CONFIRMATION })

      expect(first.status).toBe(204)
      expect(second.status).toBe(204)
      expect(await hasUserRow(user.id)).toBe(false)
    })

    it("削除後、同じ GitHub アカウントで POST /api/auth/github すると is_new_user: true で新しいユーザーができる", async () => {
      mockGetUserInfo.mockResolvedValue(GITHUB_USER)
      const loginBody = { code: "auth-code", code_verifier: "v".repeat(43), redirect_uri: "http://localhost:3000/api/auth/callback/github" }

      const firstLogin = await request(app).post("/api/auth/github").send(loginBody)
      expect(firstLogin.status).toBe(200)
      expect(firstLogin.body.is_new_user).toBe(true)

      const deleteRes = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${firstLogin.body.access_token}`)
        .send({ confirmation: CONFIRMATION, refresh_token: firstLogin.body.refresh_token })
      expect(deleteRes.status).toBe(204)

      const secondLogin = await request(app).post("/api/auth/github").send(loginBody)

      expect(secondLogin.status).toBe(200)
      expect(secondLogin.body.is_new_user).toBe(true)
      expect(secondLogin.body.user.id).not.toBe(firstLogin.body.user.id)

      const accounts = await testDb
        .select()
        .from(authAccounts)
        .where(and(eq(authAccounts.provider, "github"), eq(authAccounts.providerAccountId, GITHUB_USER.id)))
      expect(accounts).toHaveLength(1)
      expect(accounts[0]).toMatchObject({ userId: secondLogin.body.user.id })
    })
  })

  describe("異常系", () => {
    it.each([
      ["confirmation の大文字小文字が違う（Delete my account）", { confirmation: "Delete my account" }],
      ["confirmation の前後に空白がある", { confirmation: ` ${CONFIRMATION} ` }],
      ["confirmation が無い", {}],
    ])("%s場合、400 を返し何も消えない", async (_label, body) => {
      const { token, user } = await createTestUser()
      await seedUserOwnedData(user.id)
      const { jti, token: refreshToken } = await createRefreshToken(user.id)
      const rowsBefore = await countUserOwnedRows(user.id)

      const res = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...body, refresh_token: refreshToken })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
      expect(await hasUserRow(user.id)).toBe(true)
      expect(await countUserOwnedRows(user.id)).toEqual(rowsBefore)
      expect(await refreshTokenRepository.findUserId(jti)).toBe(user.id)
    })

    it("トークンがない場合、401 を返す", async () => {
      const res = await request(app).delete("/api/user").send({ confirmation: CONFIRMATION })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("削除後、同じ access token で GET /api/user・PATCH /api/user を呼ぶと 401 を返す", async () => {
      const { token, user } = await createTestUser()

      const deleteRes = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ confirmation: CONFIRMATION })
      expect(deleteRes.status).toBe(204)

      const getRes = await request(app).get("/api/user").set("Authorization", `Bearer ${token}`)
      expect(getRes.status).toBe(401)
      expect(getRes.body).toEqual({ error: expect.any(String), status_code: 401 })

      const patchRes = await request(app)
        .patch("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ timezone: "UTC" })
      expect(patchRes.status).toBe(401)
      expect(patchRes.body).toEqual({ error: expect.any(String), status_code: 401 })

      /** PATCH で行が作り直されたりしていない */
      expect(await hasUserRow(user.id)).toBe(false)
    })

    it("削除後、別の端末の refresh token で POST /api/auth/refresh を呼ぶと 401 を返し、その jti が Redis から消える", async () => {
      const { token, user } = await createTestUser()
      const { jti: otherDeviceJti, token: otherDeviceRefreshToken } = await createRefreshToken(user.id)

      const deleteRes = await request(app)
        .delete("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ confirmation: CONFIRMATION })
      expect(deleteRes.status).toBe(204)
      expect(await refreshTokenRepository.findUserId(otherDeviceJti)).toBe(user.id)

      const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .send({ refresh_token: otherDeviceRefreshToken })

      expect(refreshRes.status).toBe(401)
      expect(refreshRes.body).toEqual({ error: expect.any(String), status_code: 401 })
      expect(await refreshTokenRepository.findUserId(otherDeviceJti)).toBeNull()
    })
  })
})
