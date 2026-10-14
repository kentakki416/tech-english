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

/**
 * updateMany は条件に合った行数（updatedCount）を返す
 */
const createFakePrisma = (rows: ReturnType<typeof buildRow>[], updatedCount = 1) => {
  const findMany = vi.fn(async (_args: unknown) => rows)
  const findUnique = vi.fn(async (_args: unknown) => rows[0] ?? null)
  const updateMany = vi.fn(async (_args: unknown) => ({ count: updatedCount }))
  return {
    findMany,
    findUnique,
    prisma: { contentSource: { findMany, findUnique, updateMany } } as unknown as PrismaClient,
    updateMany,
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
      it("lastCollectedCommitSha を省略したら id だけを条件に last_collected_at だけを更新し、true を返す", async () => {
        const fake = createFakePrisma([buildRow()])
        const lastCollectedAt = new Date("2026-10-10T03:00:00.000Z")

        const isUpdated = await new PrismaContentSourceRepository(fake.prisma).markCollected(1, { lastCollectedAt })

        expect(isUpdated).toBe(true)
        expect(fake.updateMany).toHaveBeenCalledWith({ data: { lastCollectedAt }, where: { id: 1 } })
      })

      it.each([
        ["前回の SHA", "old-sha"],
        ["null（未収集）", null],
      ])("lastCollectedCommitSha を渡したら、収集を始めたときの値（%s）を条件に一緒に更新する", async (_label, expected) => {
        const fake = createFakePrisma([buildRow()])
        const lastCollectedAt = new Date("2026-10-10T03:00:00.000Z")

        const isUpdated = await new PrismaContentSourceRepository(fake.prisma).markCollected(1, {
          lastCollectedAt,
          lastCollectedCommitSha: { expected, next: "new-sha" },
        })

        expect(isUpdated).toBe(true)
        expect(fake.updateMany).toHaveBeenCalledWith({
          data: { lastCollectedAt, lastCollectedCommitSha: "new-sha" },
          where: { id: 1, lastCollectedCommitSha: expected },
        })
      })
    })

    describe("異常系", () => {
      it("収集の途中で last_collected_commit_sha が変わって条件に合わなければ false を返す（throw しない）", async () => {
        const fake = createFakePrisma([buildRow()], 0)

        const isUpdated = await new PrismaContentSourceRepository(fake.prisma).markCollected(1, {
          lastCollectedAt: new Date("2026-10-10T03:00:00.000Z"),
          lastCollectedCommitSha: { expected: "old-sha", next: "new-sha" },
        })

        expect(isUpdated).toBe(false)
      })
    })
  })
})
