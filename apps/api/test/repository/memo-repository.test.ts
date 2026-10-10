import { memos, sql } from "@repo/db"

import { DrizzleMemoRepository } from "../../src/repository/drizzle/memo-repository"
import type { MemoRepository } from "../../src/repository/memo-repository"
import { PrismaMemoRepository } from "../../src/repository/prisma/memo-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"

/**
 * Prisma / Drizzle の両実装が MemoRepository として同じ振る舞いをすることを確かめる。
 * DI で使うのは Drizzle 実装だが、Prisma 実装へ戻せる状態を保つために両方を検証する。
 */
const implementations: [string, MemoRepository][] = [
  ["Drizzle", new DrizzleMemoRepository(testDb)],
  ["Prisma", new PrismaMemoRepository(testPrisma)],
]

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s MemoRepository", (_name, memoRepository) => {
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

describe.each(implementations)("%s MemoRepository の日時", (_name, memoRepository) => {
  /**
   * created_at は DB の default（now()）で入る。Postgres のタイムゾーンが UTC 以外
   * （ローカルの docker-compose は Asia/Tokyo）でも、現在時刻（UTC）とずれないこと。
   */
  it("create した memo の createdAt が現在時刻と一致する", async () => {
    const before = Date.now()

    const created = await memoRepository.create({ body: "b", title: "t" })

    expect(Math.abs(created.createdAt.getTime() - before)).toBeLessThan(60_000)
  })
})

describe("実装間の互換性", () => {
  /**
   * timestamp（タイムゾーン無し）を UTC として扱う前提を、Postgres のタイムゾーン設定に依らず守る。
   * CI の Postgres は UTC なので、上の createdAt のテストだけではこの設定の欠落に気付けない。
   */
  it("Drizzle の接続はセッションのタイムゾーンが UTC になっている", async () => {
    const result = await testDb.execute<{ timezone: string }>(sql`SELECT current_setting('TimeZone') AS timezone`)

    expect(result.rows[0]?.timezone).toBe("UTC")
  })

  /**
   * 両 ORM とも TIMESTAMP(3)（タイムゾーン無し）を UTC として扱う前提で併存させている。
   * 片方の解釈がずれると、同じ行の日時が実装によって変わってしまう。
   */
  it("Drizzle で書いた日時を Prisma で読んでも同じ値になる", async () => {
    const createdAt = new Date("2026-03-04T05:06:07.890Z")
    const [row] = await testDb.insert(memos).values({ body: "b", createdAt, title: "t" }).returning()

    const found = await new PrismaMemoRepository(testPrisma).findById(row.id)

    expect(found?.createdAt.toISOString()).toBe(createdAt.toISOString())
  })

  it("Prisma で書いた日時を Drizzle で読んでも同じ値になる", async () => {
    const created = await new PrismaMemoRepository(testPrisma).create({ body: "b", title: "t" })

    const found = await new DrizzleMemoRepository(testDb).findById(created.id)

    expect(found?.createdAt.toISOString()).toBe(created.createdAt.toISOString())
  })
})
