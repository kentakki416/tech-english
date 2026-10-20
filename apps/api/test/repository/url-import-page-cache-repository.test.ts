import { IoRedisUrlImportPageCacheRepository } from "../../src/repository/redis"
import { cleanupTestRedis, disconnectTestDb, disconnectTestRedis, testRedis } from "../controller/setup"
import { buildChunk, buildFetchedPage } from "../fixture/url-import"

/**
 * Redis 実装の UrlImportPageCacheRepository を実 Redis（テスト用 DB 1）で確かめる。キー名・TTL・値の変換は mock では検出できないため
 */
const urlImportPageCacheRepository = new IoRedisUrlImportPageCacheRepository(testRedis)

const KEY = {
  sourceId: 2,
  sourceUpdatedAt: new Date("2026-10-20T03:00:00.000Z"),
  url: "https://go.dev/doc/tutorial/getting-started",
}

const findCacheKeys = async () => testRedis.keys("url_import_page:*")

beforeEach(async () => {
  await cleanupTestRedis()
})

afterAll(async () => {
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("IoRedisUrlImportPageCacheRepository", () => {
  describe("正常系", () => {
    it("置いたページを同じキーで読め、10 分の TTL が付く", async () => {
      const page = buildFetchedPage({
        chunks: [buildChunk({ blocks: [{ lang: "go", text: "package main", type: "code" }], rejectReasons: ["too_much_code"] })],
        etag: null,
        lastModified: null,
      })

      await urlImportPageCacheRepository.save(KEY, page)

      expect(await urlImportPageCacheRepository.find(KEY)).toEqual(page)
      const [key] = await findCacheKeys()
      expect(key).toMatch(/^url_import_page:2:1792465200000:[0-9a-f]{64}$/)
      const ttl = await testRedis.ttl(key)
      expect(ttl).toBeGreaterThan(590)
      expect(ttl).toBeLessThanOrEqual(600)
    })

    it.each([
      ["ソースの id", { ...KEY, sourceId: 3 }],
      ["ソースの更新日時", { ...KEY, sourceUpdatedAt: new Date("2026-10-20T03:00:01.000Z") }],
      ["URL", { ...KEY, url: "https://go.dev/doc/tutorial/getting-started/" }],
    ])("%s が違えば別のキーで、読めない", async (_label, otherKey) => {
      await urlImportPageCacheRepository.save(KEY, buildFetchedPage())

      expect(await urlImportPageCacheRepository.find(otherKey)).toBeNull()
    })

    it("置いていなければ null", async () => {
      expect(await urlImportPageCacheRepository.find(KEY)).toBeNull()
    })
  })

  describe("異常系", () => {
    it.each([
      ["JSON でない", "not json"],
      ["形が合わない", JSON.stringify({ title: "only title" })],
    ])("値が %s なら null", async (_label, value) => {
      await urlImportPageCacheRepository.save(KEY, buildFetchedPage())
      const [key] = await findCacheKeys()
      await testRedis.set(key, value)

      expect(await urlImportPageCacheRepository.find(KEY)).toBeNull()
    })
  })
})
