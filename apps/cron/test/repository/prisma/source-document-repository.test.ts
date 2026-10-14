import type { PrismaClient } from "@repo/db"

import { PrismaSourceDocumentRepository } from "../../../src/repository/prisma"

const CREATED_AT = new Date("2026-10-01T00:00:00.000Z")

const ROW = {
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
}

/**
 * 列どうしの比較に使う field reference の偽物
 */
const FETCHED_AT_FIELD = { modelName: "SourceDocument", name: "fetchedAt" }

const createFakePrisma = () => {
  const findMany = vi.fn(async (_args: unknown) => [ROW])
  const update = vi.fn(async (_args: unknown) => ROW)
  const upsert = vi.fn(async (_args: unknown) => ROW)
  const executeRaw = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) => 1)
  return {
    executeRaw,
    findMany,
    prisma: {
      $executeRaw: executeRaw,
      sourceDocument: { fields: { fetchedAt: FETCHED_AT_FIELD }, findMany, update, upsert },
    } as unknown as PrismaClient,
    update,
    upsert,
  }
}

/**
 * $executeRaw のテンプレートの SQL（値は $? にする）
 */
const readRawSql = (strings: TemplateStringsArray): string => strings.join("$?").replace(/\s+/g, " ").trim()

describe("PrismaSourceDocumentRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("findBySourceId", () => {
    describe("正常系", () => {
      it("ソースの文書を id 順で返す", async () => {
        const fake = createFakePrisma()

        const documents = await new PrismaSourceDocumentRepository(fake.prisma).findBySourceId(1)

        expect(documents).toEqual([ROW])
        expect(fake.findMany).toHaveBeenCalledWith({ orderBy: { id: "asc" }, where: { sourceId: 1 } })
      })
    })
  })

  describe("upsertByPath", () => {
    describe("正常系", () => {
      it("(source_id, path) の unique で upsert し、既存の行は title だけ更新する", async () => {
        const fake = createFakePrisma()

        const document = await new PrismaSourceDocumentRepository(fake.prisma).upsertByPath({
          path: "docs/a.md",
          sourceId: 1,
          title: "A",
        })

        expect(document).toEqual(ROW)
        expect(fake.upsert).toHaveBeenCalledWith({
          create: { path: "docs/a.md", sourceId: 1, title: "A" },
          update: { title: "A" },
          where: { sourceId_path: { path: "docs/a.md", sourceId: 1 } },
        })
      })
    })
  })

  describe("findFetchQueue", () => {
    describe("正常系", () => {
      it("404 / 410 を除き、未取得・sitemap の更新が新しい・取得から日がたった行を fetched_at の昇順（NULL が先）→ id で limit 件返す", async () => {
        const fake = createFakePrisma()
        const refetchBefore = new Date("2026-10-03T03:00:00.000Z")

        const documents = await new PrismaSourceDocumentRepository(fake.prisma).findFetchQueue({ limit: 30, refetchBefore, sourceId: 2 })

        expect(documents).toEqual([ROW])
        expect(fake.findMany).toHaveBeenCalledWith({
          orderBy: [{ fetchedAt: { nulls: "first", sort: "asc" } }, { id: "asc" }],
          take: 30,
          where: {
            AND: [
              { OR: [{ httpStatus: null }, { httpStatus: { notIn: [404, 410] } }] },
              { OR: [{ fetchedAt: null }, { sitemapLastmod: { gt: FETCHED_AT_FIELD } }, { fetchedAt: { lt: refetchBefore } }] },
            ],
            sourceId: 2,
          },
        })
      })
    })
  })

  describe("upsertDiscovered", () => {
    describe("正常系", () => {
      it("unnest で配列を渡す INSERT ... ON CONFLICT DO UPDATE を $executeRaw で 1 回投げる", async () => {
        const fake = createFakePrisma()

        await new PrismaSourceDocumentRepository(fake.prisma).upsertDiscovered(
          2,
          [{ path: "/doc/a", sitemapLastmod: new Date("2026-10-01T00:00:00.000Z") }, { path: "/doc/b", sitemapLastmod: null }],
          { shouldReviveGone: true },
        )

        expect(fake.executeRaw).toHaveBeenCalledTimes(1)
        const [strings, ...values] = fake.executeRaw.mock.calls[0]
        const sql = readRawSql(strings)
        expect(sql).toContain("INSERT INTO source_documents (source_id, path, sitemap_lastmod, updated_at)")
        expect(sql).toContain("FROM unnest($?::text[], $?::timestamp(3)[]) AS discovered(path, sitemap_lastmod)")
        expect(sql).toContain("ON CONFLICT (source_id, path) DO UPDATE SET")
        expect(sql).toContain("sitemap_lastmod = COALESCE(excluded.sitemap_lastmod, source_documents.sitemap_lastmod)")
        expect(sql).toContain("($?::boolean OR excluded.sitemap_lastmod > source_documents.fetched_at)")
        expect(values[0]).toBe(2)
        expect(values[2]).toEqual(["/doc/a", "/doc/b"])
        expect(values[3]).toEqual(["2026-10-01T00:00:00.000Z", null])
        expect(values).toContainEqual([404, 410])
        expect(values).toContain(true)
      })

      it("500 件ずつに分けて投げ、空なら何もしない", async () => {
        const fake = createFakePrisma()
        const repository = new PrismaSourceDocumentRepository(fake.prisma)
        const inputs = Array.from({ length: 501 }, (_, index) => ({ path: `/doc/${index}`, sitemapLastmod: null }))

        await repository.upsertDiscovered(2, inputs, { shouldReviveGone: false })
        await repository.upsertDiscovered(2, [], { shouldReviveGone: false })

        expect(fake.executeRaw.mock.calls.map(([, , , paths]) => (paths as string[]).length)).toEqual([500, 1])
      })
    })
  })

  describe("markResponse", () => {
    describe("正常系", () => {
      it("fetched_at と http_status だけを更新する", async () => {
        const fake = createFakePrisma()

        await new PrismaSourceDocumentRepository(fake.prisma).markResponse(10, { fetchedAt: CREATED_AT, httpStatus: 404 })

        expect(fake.update).toHaveBeenCalledWith({ data: { fetchedAt: CREATED_AT, httpStatus: 404 }, where: { id: 10 } })
      })
    })
  })

  describe("markFetched", () => {
    describe("正常系", () => {
      it("取得の結果を id の行に書く", async () => {
        const fake = createFakePrisma()
        const input = {
          blobSha: null,
          commitSha: null,
          contentHash: "content-hash",
          etag: "\"abc\"",
          fetchedAt: CREATED_AT,
          httpStatus: 200,
          lastModified: "Sat, 10 Oct 2026 00:00:00 GMT",
          title: "Page",
        }

        await new PrismaSourceDocumentRepository(fake.prisma).markFetched(10, input)

        expect(fake.update).toHaveBeenCalledWith({ data: input, where: { id: 10 } })
      })
    })
  })
})
