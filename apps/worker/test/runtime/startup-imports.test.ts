/**
 * @repo/content-extractor を読んだら import が失敗するようにして、起動の経路のモジュールが読まないことを確かめる
 */
vi.mock("@repo/content-extractor", () => {
  throw new Error("@repo/content-extractor must not be loaded at startup")
})

describe("起動の経路の import", () => {
  describe("正常系", () => {
    it.each([
      "../../src/repository/data-warehouse/index.js",
      "../../src/repository/drizzle/index.js",
      "../../src/runtime/collection.js",
      "../../src/runtime/graceful-shutdown.js",
      "../../src/workers/collect-source-worker.js",
      "../../src/workers/process-memo-worker.js",
      "../../src/workers/track-event-worker.js",
    ])("%s は @repo/content-extractor を読まない", async (path) => {
      await expect(import(path)).resolves.toBeDefined()
    })
  })

  describe("異常系", () => {
    it("収集の service の index は @repo/content-extractor を読むので、import が失敗する", async () => {
      await expect(import("../../src/service/collection/index.js")).rejects.toThrow()
    })
  })
})
