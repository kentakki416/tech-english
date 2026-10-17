import request from "supertest"

import { AdminTagListController } from "../../../../src/controller/admin/tag/list"
import { DrizzleTagRepository } from "../../../../src/repository/drizzle/tag-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { attachTag, insertSource, insertTag } from "./fixtures"

const app = createTestApp()

mountAdminApi(app, adminRouter({
  tag: { list: new AdminTagListController(new DrizzleTagRepository(testDb)) },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/admin/tag", () => {
  describe("正常系", () => {
    it("タグを名前の順に source_count 付きで 200 で返す", async () => {
      const cherry = await insertTag({ color: "amber", name: "cherry" })
      const banana = await insertTag({ color: "rose", name: "Banana" })
      const apple = await insertTag({ color: "blue", name: "apple" })
      const source = await insertSource("owner/a")
      await attachTag(source.id, apple.id)

      const res = await request(app).get("/api/admin/tag").set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        tags: [
          { id: apple.id, color: "blue", name: "apple", source_count: 1 },
          { id: banana.id, color: "rose", name: "Banana", source_count: 0 },
          { id: cherry.id, color: "amber", name: "cherry", source_count: 0 },
        ],
      })
    })

    it("タグが無ければ空の配列を返す", async () => {
      const res = await request(app).get("/api/admin/tag").set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ tags: [] })
    })
  })

  describe("異常系", () => {
    it("Authorization が無いと 401 を返す", async () => {
      const res = await request(app).get("/api/admin/tag")

      expect(res.status).toBe(401)
    })
  })
})
