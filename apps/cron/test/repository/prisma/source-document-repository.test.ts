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

const createFakePrisma = () => {
  const findMany = vi.fn(async (_args: unknown) => [ROW])
  const update = vi.fn(async (_args: unknown) => ROW)
  const upsert = vi.fn(async (_args: unknown) => ROW)
  return {
    findMany,
    prisma: { sourceDocument: { findMany, update, upsert } } as unknown as PrismaClient,
    update,
    upsert,
  }
}

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
