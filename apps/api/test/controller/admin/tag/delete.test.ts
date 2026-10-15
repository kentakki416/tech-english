import request from "supertest"

import { contentSources, contentSourceTags, tags } from "@repo/db"

import { AdminTagDeleteController } from "../../../../src/controller/admin/tag/delete"
import { env } from "../../../../src/env"
import { ADMIN_TOKEN_HEADER } from "../../../../src/middleware/admin-auth"
import { DrizzleTagRepository } from "../../../../src/repository/drizzle/tag-repository"
import { adminRouter } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { attachTag, insertSource, insertTag } from "./fixtures"

const app = createTestApp()

app.use("/api/admin", adminRouter({
  tag: { delete: new AdminTagDeleteController(new DrizzleTagRepository(testDb)) },
}))
attachUnhandledExceptionHandler(app)

const del = (id: number | string) => request(app).delete(`/api/admin/tag/${id}`).set(ADMIN_TOKEN_HEADER, env.ADMIN_API_TOKEN)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("DELETE /api/admin/tag/:id", () => {
  describe("正常系", () => {
    it("204 でボディが空になり、タグを付けていたソースの紐付けが消える（ソースは残る）", async () => {
      const react = await insertTag({ name: "React" })
      const source = await insertSource("owner/a")
      await attachTag(source.id, react.id)

      const res = await del(react.id)

      expect(res.status).toBe(204)
      expect(res.text).toBe("")
      expect(await testDb.select().from(tags)).toHaveLength(0)
      expect(await testDb.select().from(contentSourceTags)).toHaveLength(0)
      expect(await testDb.select().from(contentSources)).toHaveLength(1)
    })
  })

  describe("異常系", () => {
    it("存在しない id なら 404 を返す", async () => {
      const res = await del(999999)

      expect(res.status).toBe(404)
    })

    it("id が数値でないと 400 を返す", async () => {
      const res = await del("abc")

      expect(res.status).toBe(400)
    })
  })
})
