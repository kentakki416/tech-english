import { DrizzleClient, lt, memos } from "@repo/db"

import { DrizzleMemoRepository } from "../../../src/repository/drizzle"

type DeleteResult = { rowCount: number | null }

/**
 * `db.delete(table).where(condition)` だけを持つ DrizzleClient の偽物を作る
 */
const createFakeDb = (where: (_condition: unknown) => Promise<DeleteResult>) => {
  const deleteFrom = vi.fn(() => ({ where }))
  return { db: { delete: deleteFrom } as unknown as DrizzleClient, deleteFrom }
}

describe("DrizzleMemoRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("deleteOlderThan", () => {
    describe("正常系", () => {
      it("threshold より古い memo を delete で消し、件数を返す", async () => {
        const where = vi.fn<(_condition: unknown) => Promise<DeleteResult>>(async () => ({ rowCount: 5 }))
        const { db, deleteFrom } = createFakeDb(where)
        const repository = new DrizzleMemoRepository(db)
        const threshold = new Date("2026-03-01T00:00:00.000Z")

        const deletedCount = await repository.deleteOlderThan(threshold)

        expect(deletedCount).toBe(5)
        expect(deleteFrom).toHaveBeenCalledWith(memos)
        expect(where).toHaveBeenCalledWith(lt(memos.createdAt, threshold))
      })

      it("対象がゼロ件のときも 0 を返す", async () => {
        const where = vi.fn<(_condition: unknown) => Promise<DeleteResult>>(async () => ({ rowCount: 0 }))
        const repository = new DrizzleMemoRepository(createFakeDb(where).db)

        const deletedCount = await repository.deleteOlderThan(new Date())

        expect(deletedCount).toBe(0)
      })

      it("ドライバが rowCount を返さない場合も 0 を返す", async () => {
        const where = vi.fn<(_condition: unknown) => Promise<DeleteResult>>(async () => ({ rowCount: null }))
        const repository = new DrizzleMemoRepository(createFakeDb(where).db)

        const deletedCount = await repository.deleteOlderThan(new Date())

        expect(deletedCount).toBe(0)
      })
    })

    describe("異常系", () => {
      it("Drizzle が throw した場合、そのまま伝搬する", async () => {
        const where = vi.fn<(_condition: unknown) => Promise<DeleteResult>>(async () => {
          throw new Error("db connection failed")
        })
        const repository = new DrizzleMemoRepository(createFakeDb(where).db)

        await expect(repository.deleteOlderThan(new Date())).rejects.toThrow()
      })
    })
  })
})
