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
 * select ... where ... orderBy ... limit と insert ... values ... onConflictDoUpdate（returning なし）を記録する偽物
 */
const createFakeQueueDb = (rows: SourceDocumentRow[]) => {
  const limit = vi.fn(async (_count: number) => rows)
  const orderBy = vi.fn((..._columns: unknown[]) => ({ limit }))
  const where = vi.fn((_condition: unknown) => ({ orderBy }))
  const from = vi.fn((_table: unknown) => ({ where }))
  const select = vi.fn(() => ({ from }))
  const onConflictDoUpdate = vi.fn(async (_config: unknown) => ({ rowCount: 1 }))
  const values = vi.fn((_values: unknown) => ({ onConflictDoUpdate }))
  const insert = vi.fn((_table: unknown) => ({ values }))
  return { db: { insert, select } as unknown as DrizzleClient, insert, limit, onConflictDoUpdate, orderBy, values, where }
}

/**
 * 記録した条件を SQL の文字列にする。接続しない（Pool は最初のクエリまで接続しない）実物の client の toSQL を使う
 */
const renderClient = createDrizzleClient({ url: "postgresql://user:password@127.0.0.1:1/unused" })

/**
 * バインド変数の番号（$1, $2, ...）は値の数で変わるので $? にそろえる
 */
const normalizeParams = (text: string): string => text.replace(/\$\d+/g, "$?")

type OnConflictDoUpdateConfig = Parameters<ReturnType<ReturnType<DrizzleClient["insert"]>["values"]>["onConflictDoUpdate"]>[0]

describe("DrizzleSourceDocumentRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await renderClient.$disconnect()
  })

  describe("findFetchQueue", () => {
    describe("正常系", () => {
      it("404 / 410 を除き、未取得・sitemap の更新が新しい・取得から日がたった行を fetched_at の昇順（NULL が先）→ id で limit 件返す", async () => {
        const row = buildRow({ fetchedAt: null, path: "/doc/a" })
        const fake = createFakeQueueDb([row])
        const refetchBefore = new Date("2026-10-03T03:00:00.000Z")

        const documents = await new DrizzleSourceDocumentRepository(fake.db).findFetchQueue({ limit: 30, refetchBefore, sourceId: 2 })

        expect(documents).toEqual([row])
        expect(fake.limit).toHaveBeenCalledWith(30)
        /**
         * 記録した値は Drizzle の SQL（型は @repo/db から出していない）なので never で渡す
         */
        const [condition] = fake.where.mock.calls[0] as [never]
        const query = renderClient
          .select()
          .from(sourceDocuments)
          .where(condition)
          .orderBy(...(fake.orderBy.mock.calls[0] as never[]))
          .limit(30)
          .toSQL()
        expect(normalizeParams(query.sql)).toContain([
          "where ((\"source_documents\".\"source_id\" = $?)",
          " and ((((\"source_documents\".\"http_status\" is null)) or (NOT (\"source_documents\".\"http_status\" in ($?, $?)))))",
          " and ((((\"source_documents\".\"fetched_at\" is null))",
          " or (\"source_documents\".\"sitemap_lastmod\" > \"source_documents\".\"fetched_at\")",
          " or (\"source_documents\".\"fetched_at\" < $?))))",
          " order by \"source_documents\".\"fetched_at\" ASC NULLS FIRST, \"source_documents\".\"id\" asc limit $?",
        ].join(""))
        expect(query.params.slice(0, 4)).toEqual([2, 404, 410, "2026-10-03T03:00:00.000Z"])
      })
    })
  })

  describe("upsertDiscovered", () => {
    describe("正常系", () => {
      it("(source_id, path) で upsert し、sitemap_lastmod は新しい値があるときだけ、http_status は 404 / 410 で戻すときだけ更新する", async () => {
        const fake = createFakeQueueDb([])
        const lastmod = new Date("2026-10-01T00:00:00.000Z")

        await new DrizzleSourceDocumentRepository(fake.db).upsertDiscovered(
          2,
          [{ path: "/doc/a", sitemapLastmod: lastmod }, { path: "/doc/b", sitemapLastmod: null }],
          { shouldReviveGone: false },
        )

        expect(fake.insert).toHaveBeenCalledWith(sourceDocuments)
        const [rows] = fake.values.mock.calls[0]
        expect(rows).toEqual([
          { path: "/doc/a", sitemapLastmod: lastmod, sourceId: 2 },
          { path: "/doc/b", sitemapLastmod: null, sourceId: 2 },
        ])
        const config = fake.onConflictDoUpdate.mock.calls[0][0] as OnConflictDoUpdateConfig
        const query = renderClient.insert(sourceDocuments).values(rows as never).onConflictDoUpdate(config).toSQL()
        const shouldRevive = "\"source_documents\".\"http_status\" in ($?, $?) AND excluded.sitemap_lastmod > \"source_documents\".\"fetched_at\""
        expect(normalizeParams(query.sql)).toContain([
          "on conflict (\"source_id\",\"path\") do update set",
          ` "http_status" = CASE WHEN ${shouldRevive} THEN NULL ELSE "source_documents"."http_status" END,`,
          " \"sitemap_lastmod\" = COALESCE(excluded.sitemap_lastmod, \"source_documents\".\"sitemap_lastmod\"),",
          " \"updated_at\" = $?",
          " where (excluded.sitemap_lastmod IS NOT NULL AND excluded.sitemap_lastmod IS DISTINCT FROM \"source_documents\".\"sitemap_lastmod\")",
          ` OR (${shouldRevive})`,
        ].join(""))
      })

      it("shouldReviveGone なら 404 / 410 の行は無条件に http_status を NULL に戻す", async () => {
        const fake = createFakeQueueDb([])

        await new DrizzleSourceDocumentRepository(fake.db).upsertDiscovered(2, [{ path: "/doc/a", sitemapLastmod: null }], {
          shouldReviveGone: true,
        })

        const config = fake.onConflictDoUpdate.mock.calls[0][0] as OnConflictDoUpdateConfig
        const [rows] = fake.values.mock.calls[0]
        const query = renderClient.insert(sourceDocuments).values(rows as never).onConflictDoUpdate(config).toSQL()
        expect(normalizeParams(query.sql)).toContain("CASE WHEN \"source_documents\".\"http_status\" in ($?, $?) THEN NULL")
        expect(normalizeParams(query.sql)).toContain("OR (\"source_documents\".\"http_status\" in ($?, $?))")
        expect(query.sql).not.toContain("excluded.sitemap_lastmod > ")
      })

      it("500 件ずつに分けて INSERT し、空なら何もしない", async () => {
        const fake = createFakeQueueDb([])
        const repository = new DrizzleSourceDocumentRepository(fake.db)
        const inputs = Array.from({ length: 1001 }, (_, index) => ({ path: `/doc/${index}`, sitemapLastmod: null }))

        await repository.upsertDiscovered(2, inputs, { shouldReviveGone: false })
        await repository.upsertDiscovered(2, [], { shouldReviveGone: false })

        expect(fake.values.mock.calls.map(([rows]) => (rows as unknown[]).length)).toEqual([500, 500, 1])
      })
    })
  })

  describe("markResponse", () => {
    describe("正常系", () => {
      it("fetched_at と http_status だけを更新する", async () => {
        const fake = createFakeDb([])

        await new DrizzleSourceDocumentRepository(fake.db).markResponse(10, { fetchedAt: CREATED_AT, httpStatus: 304 })

        expect(fake.update).toHaveBeenCalledWith(sourceDocuments)
        expect(fake.set).toHaveBeenCalledWith({ fetchedAt: CREATED_AT, httpStatus: 304 })
        expect(fake.updateWhere).toHaveBeenCalledWith(eq(sourceDocuments.id, 10))
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
