import type { PrismaClient } from "@repo/db"

import type { CreatePassageInput } from "../../../src/repository"
import { PrismaPassageRepository } from "../../../src/repository/prisma"

const buildInput = (contentHash: string): CreatePassageInput => ({
  blocks: [{ lang: "ts", text: "const ref = useRef(0)", type: "code" }],
  contentHash,
  sourceCommitSha: "commit-sha",
  sourceDocumentId: 10,
  sourcePath: "docs/a.md",
  sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
  title: "Refs",
  wordCount: 250,
})

const createFakePrisma = (createMany: (_args: unknown) => Promise<{ count: number }>) => {
  const createManyMock = vi.fn(createMany)
  return { createMany: createManyMock, prisma: { passage: { createMany: createManyMock } } as unknown as PrismaClient }
}

describe("PrismaPassageRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("insertIgnoringDuplicates", () => {
    describe("正常系", () => {
      it("skipDuplicates で content_hash の重複を飛ばし、挿入した件数を返す", async () => {
        const fake = createFakePrisma(async () => ({ count: 1 }))
        const inputs = [buildInput("hash-1"), buildInput("hash-2")]

        const count = await new PrismaPassageRepository(fake.prisma).insertIgnoringDuplicates(inputs)

        expect(count).toBe(1)
        expect(fake.createMany).toHaveBeenCalledWith({ data: inputs, skipDuplicates: true })
      })

      it("空配列ならクエリを投げずに 0 を返す", async () => {
        const fake = createFakePrisma(async () => ({ count: 0 }))

        const count = await new PrismaPassageRepository(fake.prisma).insertIgnoringDuplicates([])

        expect(count).toBe(0)
        expect(fake.createMany).not.toHaveBeenCalled()
      })
    })

    describe("異常系", () => {
      it("Prisma が throw した場合、そのまま伝搬する", async () => {
        const fake = createFakePrisma(async () => {
          throw new Error("db connection failed")
        })

        await expect(new PrismaPassageRepository(fake.prisma).insertIgnoringDuplicates([buildInput("hash-1")]))
          .rejects.toThrow("db connection failed")
      })
    })
  })
})
