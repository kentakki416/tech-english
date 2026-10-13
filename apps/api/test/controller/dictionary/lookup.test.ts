import request from "supertest"

import { dictionaryEntries } from "@repo/db"

import { DictionaryLookupController } from "../../../src/controller/dictionary/lookup"
import { DrizzleDictionaryRepository } from "../../../src/repository/drizzle/dictionary-repository"
import { dictionaryRouter } from "../../../src/routes/dictionary-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const app = createTestApp()

app.use("/api/dictionary", dictionaryRouter({ lookup: new DictionaryLookupController(new DrizzleDictionaryRepository(testDb)) }))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
  await testDb.insert(dictionaryEntries).values([
    { headword: "render", meaningJa: "…を(…の状態に)する" },
    { headword: "run", meaningJa: "走る" },
  ])
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/dictionary", () => {
  describe("正常系", () => {
    it.each([
      ["Rendering", "render", "…を(…の状態に)する"],
      ["running", "run", "走る"],
      ["re-render", "render", "…を(…の状態に)する"],
      ["Render’s", "render", "…を(…の状態に)する"],
    ])("%s は原形の %s の意味を 200 で返す", async (word, headword, meaningJa) => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/dictionary").query({ word }).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ headword, meaning_ja: meaningJa })
    })

    it("ハイフンつきの語は接頭辞の部分を飛ばす（re が辞書にあっても re-render は render を返す）", async () => {
      await testDb.insert(dictionaryEntries).values({ headword: "re", meaningJa: "…に関して" })
      const { token } = await createTestUser()

      const res = await request(app).get("/api/dictionary").query({ word: "re-render" }).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ headword: "render", meaning_ja: "…を(…の状態に)する" })
    })

    it("64 文字の語は検索できる（境界値。見つからなければ 404）", async () => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/dictionary").query({ word: "a".repeat(64) }).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
    })
  })

  describe("異常系", () => {
    it("辞書に無い語なら 404 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/dictionary").query({ word: "xyzzy" }).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
    })

    it.each([
      ["数字", "123"],
      ["空", ""],
      ["65 文字（境界値）", "a".repeat(65)],
      ["英字以外で始まる", "-run"],
      ["空白を含む", "run fast"],
    ])("word が%sなら 400 を返す", async (_label, word) => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/dictionary").query({ word }).set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
    })

    it("word が無ければ 400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app).get("/api/dictionary").set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(400)
    })

    it("Authorization ヘッダが無ければ 401 を返す", async () => {
      const res = await request(app).get("/api/dictionary").query({ word: "run" })

      expect(res.status).toBe(401)
    })
  })
})
