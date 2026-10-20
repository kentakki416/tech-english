import { and, asc, contentSources, DrizzleClient, eq, isNull, sql } from "@repo/db"

import { DrizzleContentSourceRepository } from "../../../src/repository/drizzle"

type ContentSourceRow = typeof contentSources.$inferSelect

const CREATED_AT = new Date("2026-10-01T00:00:00.000Z")

const buildRow = (overrides: Partial<ContentSourceRow> = {}): ContentSourceRow => ({
  id: 1,
  branch: "main",
  contentSelector: null,
  excludeGlobs: [],
  excludeSelectors: [],
  fetchType: "github_repository",
  includeGlobs: ["docs/**"],
  isEnabled: true,
  kind: "docs",
  lastCollectedAt: null,
  lastCollectedCommitSha: "commit-sha",
  lastCollectedExtractionVersion: "2026-10-20.1",
  licenseSpdx: "MIT",
  licenseUrl: "https://github.com/owner/repo/blob/main/LICENSE",
  name: "Example docs",
  publicUrlStripPrefix: null,
  publicUrlTemplate: null,
  repository: "owner/repo",
  sitemapUrl: null,
  siteUrl: null,
  startUrl: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
})

/**
 * `db.select().from(table).where(condition).orderBy(...)` と `db.update(table).set(values).where(condition)` だけを持つ偽物。
 * update は条件に合った行数（updatedCount）を rowCount で返す
 */
const createFakeDb = (rows: ContentSourceRow[], updatedCount = 1) => {
  const orderBy = vi.fn(async (..._columns: unknown[]) => rows)
  /**
   * Drizzle のクエリと同じく、where の戻り値は orderBy を続けても、そのまま await してもよい（thenable）
   */
  const selectWhere = vi.fn((_condition: unknown) => ({
    orderBy,
    then: (resolve: (value: ContentSourceRow[]) => void) => resolve(rows),
  }))
  const from = vi.fn((_table: unknown) => ({ where: selectWhere }))
  const select = vi.fn(() => ({ from }))
  const updateWhere = vi.fn(async (_condition: unknown) => ({ rowCount: updatedCount }))
  const set = vi.fn((_values: unknown) => ({ where: updateWhere }))
  const update = vi.fn((_table: unknown) => ({ set }))
  return { db: { select, update } as unknown as DrizzleClient, orderBy, selectWhere, set, update, updateWhere }
}

describe("DrizzleContentSourceRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("findEnabled", () => {
    describe("正常系", () => {
      it("is_enabled のソースを last_collected_at の古い順（NULL が先）で返す", async () => {
        const fake = createFakeDb([buildRow()])

        const sources = await new DrizzleContentSourceRepository(fake.db).findEnabled()

        expect(sources).toEqual([{
          id: 1,
          branch: "main",
          excludeGlobs: [],
          fetchType: "github_repository",
          includeGlobs: ["docs/**"],
          isEnabled: true,
          kind: "docs",
          lastCollectedAt: null,
          lastCollectedCommitSha: "commit-sha",
          lastCollectedExtractionVersion: "2026-10-20.1",
          licenseSpdx: "MIT",
          licenseUrl: "https://github.com/owner/repo/blob/main/LICENSE",
          name: "Example docs",
          publicUrlStripPrefix: null,
          publicUrlTemplate: null,
          repository: "owner/repo",
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        }])
        expect(fake.selectWhere).toHaveBeenCalledWith(eq(contentSources.isEnabled, true))
        expect(fake.orderBy).toHaveBeenCalledWith(
          sql`${contentSources.lastCollectedAt} ASC NULLS FIRST`,
          asc(contentSources.id),
        )
      })
    })
  })

  describe("findById", () => {
    describe("正常系", () => {
      it("website のソースはサイトの項目つきで返す", async () => {
        const fake = createFakeDb([buildRow({
          branch: null,
          contentSelector: "main article",
          fetchType: "website",
          lastCollectedCommitSha: null,
          repository: null,
          sitemapUrl: "https://example.dev/sitemap.xml",
          siteUrl: "https://example.dev",
        })])

        const source = await new DrizzleContentSourceRepository(fake.db).findById(1)

        expect(source).toMatchObject({
          contentSelector: "main article",
          fetchType: "website",
          sitemapUrl: "https://example.dev/sitemap.xml",
          siteUrl: "https://example.dev",
          startUrl: null,
        })
        expect(source).not.toHaveProperty("repository")
      })

      it("無ければ null を返す", async () => {
        const fake = createFakeDb([])

        expect(await new DrizzleContentSourceRepository(fake.db).findById(1)).toBeNull()
      })
    })

    describe("異常系", () => {
      it("github_repository なのに repository が NULL の行は throw する", async () => {
        const fake = createFakeDb([buildRow({ repository: null })])

        await expect(new DrizzleContentSourceRepository(fake.db).findById(1)).rejects.toThrow("Invalid github_repository source")
      })
    })
  })

  describe("markCollected", () => {
    describe("正常系", () => {
      it("lastCollectedCommitSha を省略したら id だけを条件に last_collected_at だけを更新し、true を返す", async () => {
        const fake = createFakeDb([])
        const lastCollectedAt = new Date("2026-10-10T03:00:00.000Z")

        const isUpdated = await new DrizzleContentSourceRepository(fake.db).markCollected(1, { lastCollectedAt })

        expect(isUpdated).toBe(true)
        expect(fake.update).toHaveBeenCalledWith(contentSources)
        expect(fake.set).toHaveBeenCalledWith({ lastCollectedAt })
        expect(fake.updateWhere).toHaveBeenCalledWith(eq(contentSources.id, 1))
      })

      it("lastCollectedCommitSha を渡したら、収集を始めたときの SHA を条件に一緒に更新する", async () => {
        const fake = createFakeDb([])
        const lastCollectedAt = new Date("2026-10-10T03:00:00.000Z")

        const isUpdated = await new DrizzleContentSourceRepository(fake.db).markCollected(1, {
          lastCollectedAt,
          lastCollectedCommitSha: { expected: "old-sha", next: "new-sha" },
        })

        expect(isUpdated).toBe(true)
        expect(fake.set).toHaveBeenCalledWith({ lastCollectedAt, lastCollectedCommitSha: "new-sha" })
        expect(fake.updateWhere).toHaveBeenCalledWith(
          and(eq(contentSources.id, 1), eq(contentSources.lastCollectedCommitSha, "old-sha")),
        )
      })

      it("収集を始めたときの SHA が null なら IS NULL を条件にする", async () => {
        const fake = createFakeDb([])

        await new DrizzleContentSourceRepository(fake.db).markCollected(1, {
          lastCollectedAt: new Date("2026-10-10T03:00:00.000Z"),
          lastCollectedCommitSha: { expected: null, next: "new-sha" },
        })

        expect(fake.updateWhere).toHaveBeenCalledWith(
          and(eq(contentSources.id, 1), isNull(contentSources.lastCollectedCommitSha)),
        )
      })
    })

    describe("異常系", () => {
      it("収集の途中で last_collected_commit_sha が変わって条件に合わなければ false を返す", async () => {
        const fake = createFakeDb([], 0)

        const isUpdated = await new DrizzleContentSourceRepository(fake.db).markCollected(1, {
          lastCollectedAt: new Date("2026-10-10T03:00:00.000Z"),
          lastCollectedCommitSha: { expected: "old-sha", next: "new-sha" },
        })

        expect(isUpdated).toBe(false)
      })
    })
  })
})
