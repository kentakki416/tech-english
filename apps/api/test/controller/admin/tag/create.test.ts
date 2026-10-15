import request from "supertest"

import { tags } from "@repo/db"

import { AdminTagCreateController } from "../../../../src/controller/admin/tag/create"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzleTagRepository } from "../../../../src/repository/drizzle/tag-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { insertTag } from "./fixtures"

const app = createTestApp()

app.use("/api/admin", adminRouter({
  tag: { create: new AdminTagCreateController(new DrizzleTagRepository(testDb)) },
}))
attachUnhandledExceptionHandler(app)

const post = (body: unknown) => request(app).post("/api/admin/tag").set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN).send(body as object)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/admin/tag", () => {
  describe("正常系", () => {
    it("color を省くと 201 で自動で割り当てた色（タグが 0 個なら blue）が返り、DB に保存される", async () => {
      const res = await post({ name: "React" })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ id: expect.any(Number), color: "blue", name: "React" })
      const rows = await testDb.select().from(tags)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: res.body.id, color: "blue", name: "React" })
    })

    it("color を省くと、すでに使われている色を避けて割り当てる", async () => {
      await insertTag({ color: "blue", name: "Vue" })

      const res = await post({ name: "React" })

      expect(res.status).toBe(201)
      expect(res.body.color).toBe("rose")
    })

    it("color: pink を送ると pink で保存される", async () => {
      const res = await post({ color: "pink", name: "React" })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ id: expect.any(Number), color: "pink", name: "React" })
      const rows = await testDb.select().from(tags)
      expect(rows[0]).toMatchObject({ color: "pink" })
    })

    it("name の前後の空白を除いて保存する", async () => {
      const res = await post({ name: "  React  " })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe("React")
      const rows = await testDb.select().from(tags)
      expect(rows[0]).toMatchObject({ name: "React" })
    })

    it("name が 30 文字ちょうどなら 201 を返す", async () => {
      const res = await post({ name: "a".repeat(30) })

      expect(res.status).toBe(201)
    })
  })

  describe("異常系", () => {
    it.each([
      ["name が空", { name: "" }],
      ["name が空白だけ", { name: "   " }],
      ["name が 31 文字", { name: "a".repeat(31) }],
      ["name にカンマを含む", { name: "react,vue" }],
      ["color が選択肢に無い", { color: "red", name: "React" }],
      ["name が無い", { color: "blue" }],
    ])("%sなら 400 を返し、DB に保存しない", async (_label, body) => {
      const res = await post(body)

      expect(res.status).toBe(400)
      expect(await testDb.select().from(tags)).toHaveLength(0)
    })

    it.each(["react", "REACT"])("React があるときの %s は 409 を返し、行は増えない", async (name) => {
      await insertTag({ name: "React" })

      const res = await post({ name })

      expect(res.status).toBe(409)
      expect(await testDb.select().from(tags)).toHaveLength(1)
    })

    it("X-Admin-Token が無いと 401 を返す", async () => {
      const res = await request(app).post("/api/admin/tag").send({ name: "React" })

      expect(res.status).toBe(401)
    })
  })
})
