import { createDrizzleClient, DrizzleClient, passages } from "@repo/db"

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

/**
 * 記録した条件を SQL の文字列にする。接続しない（Pool は最初のクエリまで接続しない）実物の client の toSQL を使う
 */
const renderClient = createDrizzleClient({ url: "postgresql://user:password@127.0.0.1:1/unused" })

/**
 * バインド変数の番号（$1, $2, ...）は値の数で変わるので $? にそろえる
 */
const normalizeParams = (text: string): string => text.replace(/\$\d+/g, "$?")

/**
 * await でき、returning などのメソッドも続けて呼べる値（Drizzle のクエリビルダーと同じ形）。Promise にすると lint が async を付けて形が崩れるので thenable にする
 */
const buildAwaitableQuery = <T>(result: T, methods: Record<string, unknown>) => ({
  ...methods,
  then: async (onFulfilled: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected),
})

/**
 * `db.update(table).set(values).where(condition)`（returning は任意）を記録する偽物。select はクエリを組み立てるだけの実物を使う
 */
const createFakeUpdateDb = (rows: unknown[]) => {
  const returning = vi.fn(async (_selection: unknown) => rows)
  const where = vi.fn((_condition: unknown) => buildAwaitableQuery({ rowCount: rows.length }, { returning }))
  const set = vi.fn((_values: unknown) => ({ where }))
  const update = vi.fn((_table: unknown) => ({ set }))
  const select = (...args: Parameters<DrizzleClient["select"]>) => renderClient.select(...args)
  return { db: { select, update } as unknown as DrizzleClient, returning, set, update, where }
}

/**
 * 記録した set / where を UPDATE 文にする（updated_at は Drizzle が足す）
 */
const renderUpdate = (fake: ReturnType<typeof createFakeUpdateDb>) => {
  const [values] = fake.set.mock.calls[0] as [never]
  const [condition] = fake.where.mock.calls[0] as [never]
  const query = renderClient.update(passages).set(values).where(condition).toSQL()
  return { params: query.params, sql: normalizeParams(query.sql) }
}

describe("DrizzlePassageRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await renderClient.$disconnect()
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

  describe("findGeneratedOrGeneratingTitles", () => {
    describe("正常系", () => {
      it("文書の本文候補のうち、生成中・下書き・公開済みと、生成した後に却下したものの見出しを重複を除いて返す", async () => {
        const where = vi.fn(async (_condition: unknown) => [{ title: "Refs" }, { title: "Effects" }])
        const from = vi.fn((_table: unknown) => ({ where }))
        const selectDistinct = vi.fn((_selection: unknown) => ({ from }))
        const db = { selectDistinct } as unknown as DrizzleClient

        const titles = await new DrizzlePassageRepository(db).findGeneratedOrGeneratingTitles(10)

        expect(titles).toEqual(["Refs", "Effects"])
        expect(from).toHaveBeenCalledWith(passages)
        const [condition] = where.mock.calls[0] as [never]
        const query = renderClient.select().from(passages).where(condition).toSQL()
        expect(normalizeParams(query.sql)).toContain([
          "where ((\"passages\".\"source_document_id\" = $?) and (((\"passages\".\"status\" in ($?, $?, $?))",
          " or (((\"passages\".\"status\" = $?) and ((\"passages\".\"generated_at\" is not null)))))))",
        ].join(""))
        expect(query.params).toEqual([10, "draft", "generating", "published", "rejected"])
      })
    })
  })

  describe("rejectCollected", () => {
    describe("正常系", () => {
      it("文書の collected のうち content_hash が keepContentHashes に無いものを、理由つきで rejected にして件数を返す", async () => {
        const fake = createFakeUpdateDb([{ id: 1 }, { id: 2 }])

        const rejectedCount = await new DrizzlePassageRepository(fake.db).rejectCollected({
          keepContentHashes: ["hash-a", "hash-b"],
          reason: "切り分け直した",
          sourceDocumentIds: [10],
        })

        expect(rejectedCount).toBe(2)
        expect(fake.set).toHaveBeenCalledWith({ rejectReason: "切り分け直した", status: "rejected" })
        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain([
          "where ((\"passages\".\"source_document_id\" in ($?)) and (\"passages\".\"status\" = $?)",
          " and (\"passages\".\"content_hash\" not in ($?, $?)))",
        ].join(""))
        expect(params.slice(-4)).toEqual([10, "collected", "hash-a", "hash-b"])
      })

      it("keepContentHashes が空なら not in を付けず、文書の collected をすべて rejected にする", async () => {
        const fake = createFakeUpdateDb([{ id: 1 }])

        await new DrizzlePassageRepository(fake.db).rejectCollected({
          keepContentHashes: [],
          reason: "対象外",
          sourceDocumentIds: [10, 11],
        })

        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain("where ((\"passages\".\"source_document_id\" in ($?, $?)) and (\"passages\".\"status\" = $?))")
        expect(sql).not.toContain("not in")
        expect(params.slice(-3)).toEqual([10, 11, "collected"])
      })

      it("sourceDocumentIds が空なら UPDATE せずに 0 を返す", async () => {
        const fake = createFakeUpdateDb([])

        const rejectedCount = await new DrizzlePassageRepository(fake.db).rejectCollected({
          keepContentHashes: [],
          reason: "対象外",
          sourceDocumentIds: [],
        })

        expect(rejectedCount).toBe(0)
        expect(fake.update).not.toHaveBeenCalled()
      })
    })
  })
})
