import request from "supertest"

import { eq, tags } from "@repo/db"

import { AdminTagUpdateController } from "../../../../src/controller/admin/tag/update"
import { DrizzleTagRepository } from "../../../../src/repository/drizzle/tag-repository"
import { adminRouter, mountAdminApi } from "../../../../src/routes/admin-router"
import { attachUnhandledExceptionHandler, createTestAdmin, createTestApp } from "../../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../../setup"

import { insertTag } from "./fixtures"

const app = createTestApp()

mountAdminApi(app, adminRouter({
  tag: { update: new AdminTagUpdateController(new DrizzleTagRepository(testDb)) },
}))
attachUnhandledExceptionHandler(app)

let adminToken: string

const put = (id: number | string, body: unknown) =>
  request(app).put(`/api/admin/tag/${id}`).set("Authorization", `Bearer ${adminToken}`).send(body as object)

const selectTag = async (id: number) => {
  const [row] = await testDb.select().from(tags).where(eq(tags.id, id))
  return row
}

beforeEach(async () => {
  await cleanupTestData()
  adminToken = (await createTestAdmin()).token
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("PUT /api/admin/tag/:id", () => {
  describe("正常系", () => {
    it("名前と色を変えて 200 で変更後のタグを返す", async () => {
      const react = await insertTag({ color: "blue", name: "React" })

      const res = await put(react.id, { color: "pink", name: "ReactJS" })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: react.id, color: "pink", name: "ReactJS" })
      expect(await selectTag(react.id)).toMatchObject({ color: "pink", name: "ReactJS" })
    })
  })

  describe("異常系", () => {
    it.each([
      ["color が無い", { name: "React" }],
      ["name が空", { color: "blue", name: "" }],
      ["color が選択肢に無い", { color: "red", name: "React" }],
    ])("%sなら 400 を返し、行は変わらない", async (_label, body) => {
      const react = await insertTag({ color: "blue", name: "React" })

      const res = await put(react.id, body)

      expect(res.status).toBe(400)
      expect(await selectTag(react.id)).toEqual(react)
    })

    it("id が数値でないと 400 を返す", async () => {
      const res = await put("abc", { color: "blue", name: "React" })

      expect(res.status).toBe(400)
    })

    it.each([
      ["DB の integer の上限ちょうどは検証を通って 404", "2147483647", 404],
      ["上限を超えると 400", "2147483648", 400],
    ])("id が %s", async (_label, id, status) => {
      const res = await put(id, { color: "blue", name: "React" })

      expect(res.status).toBe(status)
    })

    it("存在しない id なら 404 を返す", async () => {
      const res = await put(999999, { color: "blue", name: "React" })

      expect(res.status).toBe(404)
    })

    it("ほかのタグと同じ名前（大文字・小文字違い）なら 409 を返し、行は変わらない", async () => {
      const react = await insertTag({ color: "blue", name: "React" })
      await insertTag({ color: "rose", name: "Vue" })

      const res = await put(react.id, { color: "pink", name: "vue" })

      expect(res.status).toBe(409)
      expect(await selectTag(react.id)).toEqual(react)
    })
  })
})
