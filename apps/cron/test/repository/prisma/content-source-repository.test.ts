import type { PrismaClient } from "@repo/db"

import { PrismaContentSourceRepository } from "../../../src/repository/prisma"

const CREATED_AT = new Date("2026-10-01T00:00:00.000Z")

/**
 * Prisma の ContentSource の行（jsonb は unknown で返る）
 */
const buildRow = (overrides: Record<string, unknown> = {}) => ({
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
  lastCollectedCommitSha: null,
  licenseSpdx: "MIT",
  licenseUrl: "https://github.com/owner/repo/blob/main/LICENSE",
  name: "Example docs",
  publicUrlStripPrefix: null,
  publicUrlTemplate: null,
  repository: "owner/repo",
  sitemapUrl: null,
  siteUrl: null,
  startUrl: null,
  tags: [],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
})

const createFakePrisma = (rows: ReturnType<typeof buildRow>[]) => {
  const findMany = vi.fn(async (_args: unknown) => rows)
  const findUnique = vi.fn(async (_args: unknown) => rows[0] ?? null)
  const update = vi.fn(async (_args: unknown) => rows[0])
  return {
    findMany,
    findUnique,
    prisma: { contentSource: { findMany, findUnique, update } } as unknown as PrismaClient,
    update,
  }
}

describe("PrismaContentSourceRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("findEnabled", () => {
    describe("正常系", () => {
      it("is_enabled のソースを last_collected_at の古い順（NULL が先）で返す", async () => {
        const fake = createFakePrisma([buildRow()])

        const sources = await new PrismaContentSourceRepository(fake.prisma).findEnabled()

        expect(sources).toEqual([expect.objectContaining({ id: 1, fetchType: "github_repository", repository: "owner/repo" })])
        expect(fake.findMany).toHaveBeenCalledWith({
          orderBy: [{ lastCollectedAt: { nulls: "first", sort: "asc" } }, { id: "asc" }],
          where: { isEnabled: true },
        })
      })
    })

    describe("異常系", () => {
      it.each([
        ["kind", { kind: "blog" }],
        ["licenseSpdx", { licenseSpdx: "GPL-3.0" }],
        ["includeGlobs", { includeGlobs: "docs/**" }],
      ])("%s が想定外の行は throw する", async (_label, overrides) => {
        const fake = createFakePrisma([buildRow(overrides)])

        await expect(new PrismaContentSourceRepository(fake.prisma).findEnabled()).rejects.toThrow()
      })
    })
  })

  describe("markCollected", () => {
    describe("正常系", () => {
      it("lastCollectedCommitSha を省略したら last_collected_at だけを更新する", async () => {
        const fake = createFakePrisma([buildRow()])
        const lastCollectedAt = new Date("2026-10-10T03:00:00.000Z")

        await new PrismaContentSourceRepository(fake.prisma).markCollected(1, { lastCollectedAt })

        expect(fake.update).toHaveBeenCalledWith({ data: { lastCollectedAt }, where: { id: 1 } })
      })

      it("lastCollectedCommitSha を渡したら一緒に更新する", async () => {
        const fake = createFakePrisma([buildRow()])
        const lastCollectedAt = new Date("2026-10-10T03:00:00.000Z")

        await new PrismaContentSourceRepository(fake.prisma).markCollected(1, { lastCollectedAt, lastCollectedCommitSha: "abc" })

        expect(fake.update).toHaveBeenCalledWith({
          data: { lastCollectedAt, lastCollectedCommitSha: "abc" },
          where: { id: 1 },
        })
      })
    })
  })
})
