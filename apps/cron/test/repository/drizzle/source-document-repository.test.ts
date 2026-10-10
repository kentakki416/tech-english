import { DrizzleClient, eq, sourceDocuments } from "@repo/db"

import { DrizzleSourceDocumentRepository } from "../../../src/repository/drizzle"

type SourceDocumentRow = typeof sourceDocuments.$inferSelect

const CREATED_AT = new Date("2026-10-01T00:00:00.000Z")

const buildRow = (overrides: Partial<SourceDocumentRow> = {}): SourceDocumentRow => ({
  id: 10,
  blobSha: "blob-sha",
  commitSha: "commit-sha",
  contentHash: "content-hash",
  etag: null,
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

describe("DrizzleSourceDocumentRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      it("取得の結果を id の行に書く", async () => {
        const fake = createFakeDb([])
        const input = {
          blobSha: "blob-sha",
          commitSha: "commit-sha",
          contentHash: null,
          etag: null,
          fetchedAt: CREATED_AT,
          httpStatus: null,
          lastModified: null,
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
