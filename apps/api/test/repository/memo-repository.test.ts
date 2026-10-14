import { memos, sql } from "@repo/db"

import { DrizzleMemoRepository } from "../../src/repository/drizzle/memo-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

const memoRepository = new DrizzleMemoRepository(testDb)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("MemoRepository", () => {
  describe("正常系", () => {
    it("create したメモを findById で取得できる", async () => {
      const created = await memoRepository.create({ body: "Body", title: "Title" })

      const found = await memoRepository.findById(created.id)

      expect(found).toEqual(created)
    })

    it("findAll は作成日時の降順で返す", async () => {
      await testDb.insert(memos).values([
        { body: "b", createdAt: new Date("2026-01-01T00:00:00.000Z"), title: "older" },
        { body: "b", createdAt: new Date("2026-02-01T00:00:00.000Z"), title: "newer" },
      ])

      const found = await memoRepository.findAll()

      expect(found.map((memo) => memo.title)).toEqual(["newer", "older"])
    })

    it("update で内容を更新し、updatedAt を進める", async () => {
      const created = await memoRepository.create({ body: "Old Body", title: "Old Title" })

      const updated = await memoRepository.update(created.id, { body: "New Body", title: "New Title" })

      expect(updated).toMatchObject({ body: "New Body", id: created.id, title: "New Title" })
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())
    })

    it("deleteById で削除され、findById が null を返す", async () => {
      const created = await memoRepository.create({ body: "Body", title: "Title" })

      await memoRepository.deleteById(created.id)

      expect(await memoRepository.findById(created.id)).toBeNull()
    })
  })

  describe("異常系", () => {
    it("findById は存在しない id で null を返す", async () => {
      expect(await memoRepository.findById(999999)).toBeNull()
    })

    it("update は存在しない id で throw する", async () => {
      await expect(memoRepository.update(999999, { body: "b", title: "t" })).rejects.toThrow()
    })

    it("deleteById は存在しない id で throw する", async () => {
      await expect(memoRepository.deleteById(999999)).rejects.toThrow()
    })
  })
})

describe("MemoRepository の日時", () => {
  /**
   * created_at は DB の default（now()）で入る。Postgres のタイムゾーンが UTC 以外
   * （ローカルの docker-compose は Asia/Tokyo）でも、現在時刻（UTC）とずれないこと。
   */
  it("create した memo の createdAt が現在時刻と一致する", async () => {
    const before = Date.now()

    const created = await memoRepository.create({ body: "b", title: "t" })

    expect(Math.abs(created.createdAt.getTime() - before)).toBeLessThan(60_000)
  })

  /**
   * timestamp（タイムゾーン無し）を UTC として扱う前提を、Postgres のタイムゾーン設定に依らず守る。
   * CI の Postgres は UTC なので、上の createdAt のテストだけではこの設定の欠落に気付けない。
   */
  it("Drizzle の接続はセッションのタイムゾーンが UTC になっている", async () => {
    const result = await testDb.execute<{ timezone: string }>(sql`SELECT current_setting('TimeZone') AS timezone`)

    expect(result.rows[0]?.timezone).toBe("UTC")
  })
})
