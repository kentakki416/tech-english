import { createDrizzleClient, DrizzleClient, eq, sourceDocuments } from "@repo/db"

import { DrizzleSourceDocumentRepository } from "../../../src/repository/drizzle"

type SourceDocumentRow = typeof sourceDocuments.$inferSelect

const CREATED_AT = new Date("2026-10-01T00:00:00.000Z")

const buildRow = (overrides: Partial<SourceDocumentRow> = {}): SourceDocumentRow => ({
  id: 10,
  blobSha: "blob-sha",
  commitSha: "commit-sha",
  contentHash: "content-hash",
  etag: null,
  extractionVersion: "2026-10-20.1",
  fetchedAt: CREATED_AT,
  httpStatus: null,
  lastModified: null,
  path: "docs/a.md",
  sitemapLastmod: null,
  sourceId: 1,
  title: "A",
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
})

/**
 * insert ... on conflict do update ... returning と update ... set ... where だけを持つ偽物
 */
const createFakeDb = (rows: SourceDocumentRow[]) => {
  const returning = vi.fn(async () => rows)
  const onConflictDoUpdate = vi.fn((_options: unknown) => ({ returning }))
  const values = vi.fn((_values: unknown) => ({ onConflictDoUpdate }))
  const insert = vi.fn((_table: unknown) => ({ values }))
  const updateWhere = vi.fn(async (_condition: unknown) => ({ rowCount: 1 }))
  const set = vi.fn((_values: unknown) => ({ where: updateWhere }))
  const update = vi.fn((_table: unknown) => ({ set }))
  return { db: { insert, update } as unknown as DrizzleClient, insert, onConflictDoUpdate, set, update, updateWhere, values }
}

/**
 * 記録した条件を SQL の文字列にする。接続しない（Pool は最初のクエリまで接続しない）実物の client の toSQL を使う
 */
const renderClient = createDrizzleClient({ url: "postgresql://user:password@127.0.0.1:1/unused" })

/**
 * バインド変数の番号（$1, $2, ...）は値の数で変わるので $? にそろえる
 */
const normalizeParams = (text: string): string => text.replace(/\$\d+/g, "$?")

describe("DrizzleSourceDocumentRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await renderClient.$disconnect()
  })

  describe("findWithCollectedPassages", () => {
    describe("正常系", () => {
      it("collected の本文候補を持つ文書を id の昇順で返す", async () => {
        const row = buildRow()
        const orderBy = vi.fn(async (..._columns: unknown[]) => [row])
        const where = vi.fn((_condition: unknown) => ({ orderBy }))
        const from = vi.fn((_table: unknown) => ({ where }))
        const db = { select: vi.fn(() => ({ from })) } as unknown as DrizzleClient

        const documents = await new DrizzleSourceDocumentRepository(db).findWithCollectedPassages(2)

        expect(documents).toEqual([row])
        const [condition] = where.mock.calls[0] as [never]
        const query = renderClient
          .select()
          .from(sourceDocuments)
          .where(condition)
          .orderBy(...(orderBy.mock.calls[0] as never[]))
          .toSQL()
        expect(normalizeParams(query.sql)).toContain([
          "where ((\"source_documents\".\"source_id\" = $?) and (EXISTS (SELECT 1 FROM \"passages\"",
          " WHERE \"passages\".\"source_document_id\" = \"source_documents\".\"id\" AND \"passages\".\"status\" = 'collected')))",
          " order by \"source_documents\".\"id\" asc",
        ].join(""))
        expect(query.params).toEqual([2])
      })
    })
  })

  describe("upsertByPath", () => {
    describe("正常系", () => {
      it("(source_id, path) で upsert し、既存の行は title だけ更新して行を返す", async () => {
        const fake = createFakeDb([buildRow()])

        const document = await new DrizzleSourceDocumentRepository(fake.db).upsertByPath({
          path: "docs/a.md",
          sourceId: 1,
          title: "A",
        })

        expect(document).toEqual(buildRow())
        expect(fake.insert).toHaveBeenCalledWith(sourceDocuments)
        expect(fake.values).toHaveBeenCalledWith({ path: "docs/a.md", sourceId: 1, title: "A" })
        expect(fake.onConflictDoUpdate).toHaveBeenCalledWith({
          set: { title: "A" },
          target: [sourceDocuments.sourceId, sourceDocuments.path],
        })
      })
    })
  })

  describe("markFetched", () => {
    describe("正常系", () => {
      it("取得の結果と抽出の版を id の行に書く", async () => {
        const fake = createFakeDb([])
        const input = {
          blobSha: "blob-sha",
          commitSha: "commit-sha",
          contentHash: null,
          extractionVersion: "2026-10-20.1",
          fetchedAt: CREATED_AT,
          title: null,
        }

        await new DrizzleSourceDocumentRepository(fake.db).markFetched(10, input)

        expect(fake.update).toHaveBeenCalledWith(sourceDocuments)
        expect(fake.set).toHaveBeenCalledWith(input)
        expect(fake.updateWhere).toHaveBeenCalledWith(eq(sourceDocuments.id, 10))
      })
    })
  })
})
