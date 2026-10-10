import { contentSources, eq, passages, sourceDocuments } from "@repo/db"
import type { PassageStatus } from "@repo/domain"

import type { ContentSourceInput, ContentSourceRepository } from "../../src/repository/content-source-repository"
import { DrizzleContentSourceRepository } from "../../src/repository/drizzle/content-source-repository"
import { PrismaContentSourceRepository } from "../../src/repository/prisma/content-source-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"

/**
 * Prisma / Drizzle の両実装が ContentSourceRepository として同じ振る舞いをすることを確かめる。
 * DI で使うのは Drizzle 実装だが、Prisma 実装へ戻せる状態を保つために両方を検証する。
 */
const implementations: [string, ContentSourceRepository][] = [
  ["Drizzle", new DrizzleContentSourceRepository(testDb)],
  ["Prisma", new PrismaContentSourceRepository(testPrisma)],
]

type GitHubRepositoryInput = Extract<ContentSourceInput, { fetchType: "github_repository" }>
type WebsiteInput = Extract<ContentSourceInput, { fetchType: "website" }>

const GITHUB_INPUT: GitHubRepositoryInput = {
  branch: "main",
  excludeGlobs: ["src/content/blog/**"],
  fetchType: "github_repository",
  includeGlobs: ["src/content/learn/**/*.md", "src/content/reference/**/*.md"],
  isEnabled: true,
  kind: "docs",
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
  name: "React 公式ドキュメント",
  publicUrlStripPrefix: "src/content/",
  publicUrlTemplate: "https://react.dev/{path}",
  repository: "reactjs/react.dev",
  tags: ["react", "frontend"],
}

const WEBSITE_INPUT: WebsiteInput = {
  contentSelector: "main article",
  excludeGlobs: ["/doc/devel/**"],
  excludeSelectors: [".feedback", "nav.toc"],
  fetchType: "website",
  includeGlobs: ["/doc/**"],
  isEnabled: false,
  kind: "docs",
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://go.dev/copyright",
  name: "Go 公式ドキュメント",
  sitemapUrl: "https://go.dev/sitemap.xml",
  siteUrl: "https://go.dev",
  startUrl: null,
  tags: ["go"],
}

const insertSourceDocument = async (sourceId: number, path: string, httpStatus: number | null = null) => {
  const [row] = await testDb.insert(sourceDocuments).values({ httpStatus, path, sourceId }).returning()
  return row
}

let passageSequence = 0

/**
 * passages を必須列と状態だけで入れる（content_hash は unique なので連番にする）
 */
const insertPassages = async (sourceDocumentId: number, status: PassageStatus, times: number) => {
  for (let index = 0; index < times; index++) {
    passageSequence++
    await testDb.insert(passages).values({
      blocks: [{ text: "Body", type: "paragraph" }],
      contentHash: `hash-${passageSequence}`,
      sourceDocumentId,
      sourcePath: "docs/index.md",
      sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
      status,
      title: "Title",
      wordCount: 300,
    })
  }
}

/**
 * 集計の行は順序を決めていないので、比べる前に並べる
 */
const sortCountRows = <Row extends { sourceId: number; status?: string }>(rows: Row[]): Row[] =>
  [...rows].sort((left, right) =>
    left.sourceId - right.sourceId || (left.status ?? "").localeCompare(right.status ?? ""))

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s ContentSourceRepository", (_name, contentSourceRepository) => {
  describe("正常系", () => {
    it("github を create すると findById / findByRepository で同じ値が返る", async () => {
      const created = await contentSourceRepository.create(GITHUB_INPUT)

      expect(created).toEqual({
        ...GITHUB_INPUT,
        id: expect.any(Number),
        lastCollectedAt: null,
        lastCollectedCommitSha: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
      expect(await contentSourceRepository.findById(created.id)).toEqual(created)
      expect(await contentSourceRepository.findByRepository("reactjs/react.dev")).toEqual(created)
    })

    it("website を create すると findById / findBySiteUrl で同じ値が返る", async () => {
      const created = await contentSourceRepository.create(WEBSITE_INPUT)

      expect(created).toEqual({
        ...WEBSITE_INPUT,
        id: expect.any(Number),
        lastCollectedAt: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
      expect(await contentSourceRepository.findById(created.id)).toEqual(created)
      expect(await contentSourceRepository.findBySiteUrl("https://go.dev")).toEqual(created)
    })

    it("findAll は id の昇順で返す", async () => {
      const first = await contentSourceRepository.create(WEBSITE_INPUT)
      const second = await contentSourceRepository.create(GITHUB_INPUT)

      const found = await contentSourceRepository.findAll()

      expect(found.map((source) => source.id)).toEqual([first.id, second.id])
    })

    it("github の update は渡した列を書き、shouldResetCollectedCommit: false なら last_collected_commit_sha を残す", async () => {
      const created = await contentSourceRepository.create(GITHUB_INPUT)
      await testDb.update(contentSources).set({ lastCollectedCommitSha: "abc123" }).where(eq(contentSources.id, created.id))
      const input: GitHubRepositoryInput = {
        ...GITHUB_INPUT,
        isEnabled: false,
        kind: "github",
        licenseSpdx: "MIT",
        licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE",
        name: "React Docs",
        publicUrlStripPrefix: null,
        publicUrlTemplate: null,
        tags: [],
      }

      const updated = await contentSourceRepository.update(created.id, input, { shouldResetCollectedCommit: false })

      expect(updated).toEqual({
        ...input,
        id: created.id,
        lastCollectedAt: null,
        lastCollectedCommitSha: "abc123",
        createdAt: created.createdAt,
        updatedAt: expect.any(Date),
      })
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())
      expect(await contentSourceRepository.findById(created.id)).toEqual(updated)
    })

    it("github の update は shouldResetCollectedCommit: true なら last_collected_commit_sha を null にする", async () => {
      const created = await contentSourceRepository.create(GITHUB_INPUT)
      await testDb.update(contentSources).set({ lastCollectedCommitSha: "abc123" }).where(eq(contentSources.id, created.id))
      const input: GitHubRepositoryInput = { ...GITHUB_INPUT, branch: "canary", includeGlobs: ["docs/**/*.md"] }

      const updated = await contentSourceRepository.update(created.id, input, { shouldResetCollectedCommit: true })

      expect(updated).toMatchObject({ branch: "canary", includeGlobs: ["docs/**/*.md"], lastCollectedCommitSha: null })
      const [row] = await testDb.select().from(contentSources).where(eq(contentSources.id, created.id))
      expect(row).toMatchObject({ branch: "canary", includeGlobs: ["docs/**/*.md"], lastCollectedCommitSha: null })
    })

    it("website の update は渡した列を書く", async () => {
      const created = await contentSourceRepository.create(WEBSITE_INPUT)
      const input: WebsiteInput = {
        ...WEBSITE_INPUT,
        contentSelector: null,
        excludeGlobs: [],
        excludeSelectors: [],
        includeGlobs: ["/doc/tutorial/**"],
        isEnabled: true,
        sitemapUrl: null,
        startUrl: "https://go.dev/doc/",
      }

      const updated = await contentSourceRepository.update(created.id, input, { shouldResetCollectedCommit: false })

      expect(updated).toEqual({
        ...input,
        id: created.id,
        lastCollectedAt: null,
        createdAt: created.createdAt,
        updatedAt: expect.any(Date),
      })
      expect(await contentSourceRepository.findById(created.id)).toEqual(updated)
    })

    it("countPassagesBySource / countFailedPagesBySource / findFailedPages が source_documents と passages の内容と一致する", async () => {
      const github = await contentSourceRepository.create(GITHUB_INPUT)
      const website = await contentSourceRepository.create(WEBSITE_INPUT)
      const learn = await insertSourceDocument(github.id, "src/content/learn/a.md")
      const reference = await insertSourceDocument(github.id, "src/content/reference/b.md")
      await insertPassages(learn.id, "collected", 2)
      await insertPassages(learn.id, "draft", 1)
      await insertPassages(reference.id, "collected", 1)
      await insertPassages(reference.id, "published", 1)
      /**
       * http_status が 400 以上の行だけを取得失敗として数える（399 / 304 / 200 / NULL は数えない）
       */
      await insertSourceDocument(website.id, "/doc/b", 404)
      await insertSourceDocument(website.id, "/doc/a", 500)
      await insertSourceDocument(website.id, "/doc/e", 400)
      await insertSourceDocument(website.id, "/doc/f", 399)
      await insertSourceDocument(website.id, "/doc/c", 304)
      const fetchedPage = await insertSourceDocument(website.id, "/doc/d", 200)
      await insertSourceDocument(website.id, "/doc/g", null)
      await insertPassages(fetchedPage.id, "rejected", 1)

      expect(sortCountRows(await contentSourceRepository.countPassagesBySource())).toEqual([
        { count: 3, sourceId: github.id, status: "collected" },
        { count: 1, sourceId: github.id, status: "draft" },
        { count: 1, sourceId: github.id, status: "published" },
        { count: 1, sourceId: website.id, status: "rejected" },
      ])
      expect(sortCountRows(await contentSourceRepository.countPassagesBySource(github.id))).toEqual([
        { count: 3, sourceId: github.id, status: "collected" },
        { count: 1, sourceId: github.id, status: "draft" },
        { count: 1, sourceId: github.id, status: "published" },
      ])
      expect(await contentSourceRepository.countFailedPagesBySource()).toEqual([{ count: 3, sourceId: website.id }])
      expect(await contentSourceRepository.findFailedPages(website.id)).toEqual([
        { httpStatus: 500, path: "/doc/a" },
        { httpStatus: 404, path: "/doc/b" },
        { httpStatus: 400, path: "/doc/e" },
      ])
      expect(await contentSourceRepository.findFailedPages(github.id)).toEqual([])
    })

    it("本文候補も取得失敗も無ければ集計は空になる", async () => {
      const github = await contentSourceRepository.create(GITHUB_INPUT)

      expect(await contentSourceRepository.countPassagesBySource()).toEqual([])
      expect(await contentSourceRepository.countPassagesBySource(github.id)).toEqual([])
      expect(await contentSourceRepository.countFailedPagesBySource()).toEqual([])
    })
  })

  describe("異常系", () => {
    it("findById / findByRepository / findBySiteUrl は該当が無ければ null を返す", async () => {
      expect(await contentSourceRepository.findById(999999)).toBeNull()
      expect(await contentSourceRepository.findByRepository("owner/none")).toBeNull()
      expect(await contentSourceRepository.findBySiteUrl("https://none.example.com")).toBeNull()
    })

    it("update は存在しない id で throw する", async () => {
      await expect(
        contentSourceRepository.update(999999, GITHUB_INPUT, { shouldResetCollectedCommit: false }),
      ).rejects.toThrow()
    })

    it("update は取得方法が違う行を対象にせず throw し、行は変わらない", async () => {
      const created = await contentSourceRepository.create(GITHUB_INPUT)

      await expect(
        contentSourceRepository.update(created.id, WEBSITE_INPUT, { shouldResetCollectedCommit: false }),
      ).rejects.toThrow()
      expect(await contentSourceRepository.findById(created.id)).toEqual(created)
    })

    it("create は登録済みの repository / site_url で throw する（unique 制約）", async () => {
      await contentSourceRepository.create(GITHUB_INPUT)
      await contentSourceRepository.create(WEBSITE_INPUT)

      await expect(contentSourceRepository.create({ ...GITHUB_INPUT, name: "dup" })).rejects.toThrow()
      await expect(contentSourceRepository.create({ ...WEBSITE_INPUT, name: "dup" })).rejects.toThrow()
    })
  })
})

describe("実装間の互換性", () => {
  it.each([
    ["github", GITHUB_INPUT],
    ["website", WEBSITE_INPUT],
  ])("Drizzle で作った %s のソースを Prisma で読んでも同じ値になる", async (_label, input) => {
    const created = await new DrizzleContentSourceRepository(testDb).create(input)

    const found = await new PrismaContentSourceRepository(testPrisma).findById(created.id)

    expect(found).toEqual(created)
  })
})
