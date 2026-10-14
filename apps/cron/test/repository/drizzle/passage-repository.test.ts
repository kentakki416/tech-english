import { DrizzleClient, passages } from "@repo/db"

import type { CreatePassageInput } from "../../../src/repository"
import { DrizzlePassageRepository } from "../../../src/repository/drizzle"

const buildInput = (contentHash: string): CreatePassageInput => ({
  blocks: [{ text: "Refs let you remember values.", type: "paragraph" }],
  contentHash,
  sourceCommitSha: "commit-sha",
  sourceDocumentId: 10,
  sourcePath: "docs/a.md",
  sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
  title: "Refs",
  wordCount: 250,
})

/**
 * `db.insert(table).values(rows).onConflictDoNothing(options).returning(selection)` だけを持つ DrizzleClient の偽物
 */
const createFakeDb = (returning: (_selection: unknown) => Promise<{ id: number }[]>) => {
  const returningMock = vi.fn(returning)
  const onConflictDoNothing = vi.fn((_options: unknown) => ({ returning: returningMock }))
  const values = vi.fn((_rows: unknown) => ({ onConflictDoNothing }))
  const insert = vi.fn((_table: unknown) => ({ values }))
  return { db: { insert } as unknown as DrizzleClient, insert, onConflictDoNothing, returning: returningMock, values }
}

describe("DrizzlePassageRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("insertIgnoringDuplicates", () => {
    describe("正常系", () => {
      it("content_hash の重複を ON CONFLICT DO NOTHING で飛ばし、挿入できた件数を返す", async () => {
        const fake = createFakeDb(async () => [{ id: 1 }])
        const inputs = [buildInput("hash-1"), buildInput("hash-2")]

        const count = await new DrizzlePassageRepository(fake.db).insertIgnoringDuplicates(inputs)

        expect(count).toBe(1)
        expect(fake.insert).toHaveBeenCalledWith(passages)
        expect(fake.values).toHaveBeenCalledWith(inputs)
        expect(fake.onConflictDoNothing).toHaveBeenCalledWith({ target: passages.contentHash })
        expect(fake.returning).toHaveBeenCalledWith({ id: passages.id })
      })

      it("空配列ならクエリを投げずに 0 を返す", async () => {
        const fake = createFakeDb(async () => [])

        const count = await new DrizzlePassageRepository(fake.db).insertIgnoringDuplicates([])

        expect(count).toBe(0)
        expect(fake.insert).not.toHaveBeenCalled()
      })
    })

    describe("異常系", () => {
      it("Drizzle が throw した場合、そのまま伝搬する", async () => {
        const fake = createFakeDb(async () => {
          throw new Error("db connection failed")
        })

        await expect(new DrizzlePassageRepository(fake.db).insertIgnoringDuplicates([buildInput("hash-1")]))
          .rejects.toThrow("db connection failed")
      })
    })
  })
})
