import request from "supertest"

import { eq, users } from "@repo/db"

import { UserUpdateController } from "../../../src/controller/user/update"
import { generateAccessToken } from "../../../src/lib/jwt"
import { DrizzleUserRepository } from "../../../src/repository/drizzle/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const userRepository = new DrizzleUserRepository(testDb)

const app = createTestApp()

app.use("/api/user", userRouter({ update: new UserUpdateController(userRepository) }))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("PATCH /api/user", () => {
  describe("正常系", () => {
    it("200 と更新後のユーザー情報を返し、DB のタイムゾーンが変わる", async () => {
      const { token, user } = await createTestUser({ email: "test@example.com", name: "Test User" })

      const res = await request(app)
        .patch("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ timezone: "America/New_York" })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: user.id,
        avatar_url: "https://example.com/avatar.jpg",
        email: "test@example.com",
        name: "Test User",
        timezone: "America/New_York",
        created_at: expect.any(String),
      })

      const [updatedUser] = await testDb.select().from(users).where(eq(users.id, user.id))
      expect(updatedUser).toMatchObject({
        email: "test@example.com",
        name: "Test User",
        timezone: "America/New_York",
      })
    })

    it.each(["UTC", "Asia/Kolkata"])("%s も有効なタイムゾーンとして 200 を返す", async (timezone) => {
      const { token, user } = await createTestUser()

      const res = await request(app)
        .patch("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ timezone })

      expect(res.status).toBe(200)
      expect(res.body.timezone).toBe(timezone)

      const [updatedUser] = await testDb.select().from(users).where(eq(users.id, user.id))
      expect(updatedUser.timezone).toBe(timezone)
    })
  })

  describe("異常系", () => {
    it.each([
      ["不正なタイムゾーン（Foo/Bar）", { timezone: "Foo/Bar" }],
      ["空文字", { timezone: "" }],
      ["timezone が無い", {}],
    ])("%sの場合、400 を返し DB は変わらない", async (_label, body) => {
      const { token, user } = await createTestUser()

      const res = await request(app)
        .patch("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })

      const [unchangedUser] = await testDb.select().from(users).where(eq(users.id, user.id))
      expect(unchangedUser.timezone).toBe("Asia/Tokyo")
    })

    it("トークンがない場合、401 を返す", async () => {
      const res = await request(app).patch("/api/user").send({ timezone: "UTC" })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })

    it("存在しないユーザーのトークンの場合、401 を返す", async () => {
      const token = generateAccessToken(999999)

      const res = await request(app)
        .patch("/api/user")
        .set("Authorization", `Bearer ${token}`)
        .send({ timezone: "UTC" })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    })
  })
})
