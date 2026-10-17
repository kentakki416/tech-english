import request from "supertest"

import { users } from "@repo/db"

import { UserGetController } from "../../../src/controller/user/get"
import { generateAdminAccessToken } from "../../../src/lib/admin-jwt"
import { generateAccessToken } from "../../../src/lib/jwt"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const userRepository = new DrizzleUserRepository(testDb)

const app = createTestApp()

const userGetController = new UserGetController(userRepository)

app.use("/api/user", userRouter({ get: userGetController }))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/user", () => {
  it("認証済みユーザーの場合、200 とユーザー情報を返す", async () => {
    const [user] = await testDb
      .insert(users)
      .values({
        avatarUrl: "https://example.com/avatar.jpg",
        email: "test@example.com",
        name: "Test User",
      })
      .returning()

    const token = generateAccessToken(user.id)

    const res = await request(app)
      .get("/api/user")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      avatar_url: "https://example.com/avatar.jpg",
      created_at: expect.any(String),
      email: "test@example.com",
      id: user.id,
      name: "Test User",
      timezone: "Asia/Tokyo",
    })
  })

  it("ユーザーが存在しない場合（削除済みユーザーの access token）、401 を返す", async () => {
    const token = generateAccessToken(999999)

    const res = await request(app)
      .get("/api/user")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })

  it("admin の access token の場合、同じ ID のユーザーが居ても 401 を返す（一般ユーザーの API では使えない）", async () => {
    const { user } = await createTestUser()

    const res = await request(app)
      .get("/api/user")
      .set("Authorization", `Bearer ${generateAdminAccessToken(user.id)}`)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })

  it("トークンがない場合、401 を返す", async () => {
    const res = await request(app).get("/api/user")

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })

  it("無効なトークンの場合、401 を返す", async () => {
    const res = await request(app)
      .get("/api/user")
      .set("Authorization", "Bearer invalid-token")

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })
})
