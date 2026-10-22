import { asc, eq, passages, sourceDocuments, sources, sourceTags, tags } from "@repo/db"
import type { PassageStatus, TagColor } from "@repo/domain"

import { DrizzleSourceRepository } from "../../src/repository/drizzle/source-repository"
import type {
  SourceInput,
  SourceRepository,
  SourceUpdateOptions,
  SourceWithTags,
} from "../../src/repository/source-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

const sourceRepository = new DrizzleSourceRepository(testDb)

type GitHubRepositoryInput = Extract<SourceInput, { fetchType: "github_repository" }>
type WebsiteInput = Extract<SourceInput, { fetchType: "website" }>

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
  tagIds: [],
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
  siteUrl: "https://go.dev",
  tagIds: [],
}

/**
 * 収集の状態を何も戻さない update の options
 */
const NO_RESET: SourceUpdateOptions = { shouldResetCollectedCommit: false }

/**
 * 入力から tagIds を外したもの（ソースの列）。期待値を組み立てるのに使う
 */
const omitTagIds = ({ tagIds, ...columns }: SourceInput) => columns

/**
 * create して作ったソースを返す（duplicate / missing_tags なら throw する）
 */
const createSource = async (repository: SourceRepository, input: SourceInput): Promise<SourceWithTags> => {
  const result = await repository.create(input)
  if (result.kind !== "saved") throw new Error(`Unexpected ${result.kind}: ${input.name}`)
  return result.source
}

/**
 * update して更新したソースを返す（duplicate / missing_tags なら throw する）
 */
const updateSource = async (
  repository: SourceRepository,
  id: number,
  input: SourceInput,
  options: SourceUpdateOptions,
): Promise<SourceWithTags> => {
  const result = await repository.update(id, input, options)
  if (result.kind !== "saved") throw new Error(`Unexpected ${result.kind}: id=${id}`)
  return result.source
}

const insertTag = async (name: string, color: TagColor = "blue") => {
  const [row] = await testDb.insert(tags).values({ color, name }).returning()
  return row
}

/**
 * ソースに付いているタグの id（昇順）
 */
const selectSourceTagIds = async (sourceId: number): Promise<number[]> => {
  const rows = await testDb
    .select({ tagId: sourceTags.tagId })
    .from(sourceTags)
    .where(eq(sourceTags.sourceId, sourceId))
    .orderBy(asc(sourceTags.tagId))
  return rows.map((row) => row.tagId)
}

const insertSourceDocument = async (sourceId: number, path: string) => {
  const [row] = await testDb.insert(sourceDocuments).values({ path, sourceId }).returning()
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

describe("SourceRepository", () => {
  describe("正常系", () => {
    it("github を create すると findById / findByRepository で同じ値が返る", async () => {
      const created = await createSource(sourceRepository, GITHUB_INPUT)

      expect(created).toEqual({
        ...omitTagIds(GITHUB_INPUT),
        id: expect.any(Number),
        lastCollectedAt: null,
        lastCollectedCommitSha: null,
        lastCollectedExtractionVersion: null,
        tags: [],
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
      expect(await sourceRepository.findById(created.id)).toEqual(created)
      const { tags: createdTags, ...createdColumns } = created
      expect(await sourceRepository.findByRepository("reactjs/react.dev")).toEqual(createdColumns)
    })

    it("website を create すると findById / findBySiteUrl で同じ値が返る", async () => {
      const created = await createSource(sourceRepository, WEBSITE_INPUT)

      expect(created).toEqual({
        ...omitTagIds(WEBSITE_INPUT),
        id: expect.any(Number),
        lastCollectedAt: null,
        tags: [],
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
      expect(await sourceRepository.findById(created.id)).toEqual(created)
      const { tags: createdTags, ...createdColumns } = created
      expect(await sourceRepository.findBySiteUrl("https://go.dev")).toEqual(createdColumns)
    })

    it("findAll は id の昇順で返す", async () => {
      const first = await createSource(sourceRepository, WEBSITE_INPUT)
      const second = await createSource(sourceRepository, GITHUB_INPUT)

      const found = await sourceRepository.findAll()

      expect(found.map((source) => source.id)).toEqual([first.id, second.id])
    })

    it("github の update は渡した列を書き、shouldResetCollectedCommit: false なら last_collected_commit_sha を残す", async () => {
      const created = await createSource(sourceRepository, GITHUB_INPUT)
      await testDb
        .update(sources)
        .set({ lastCollectedCommitSha: "abc123", lastCollectedExtractionVersion: "2026-10-20.1" })
        .where(eq(sources.id, created.id))
      const input: GitHubRepositoryInput = {
        ...GITHUB_INPUT,
        isEnabled: false,
        kind: "github",
        licenseSpdx: "MIT",
        licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE",
        name: "React Docs",
        publicUrlStripPrefix: null,
        publicUrlTemplate: null,
      }

      const updated = await updateSource(sourceRepository, created.id, input, NO_RESET)

      expect(updated).toEqual({
        ...omitTagIds(input),
        id: created.id,
        lastCollectedAt: null,
        lastCollectedCommitSha: "abc123",
        lastCollectedExtractionVersion: "2026-10-20.1",
        tags: [],
        createdAt: created.createdAt,
        updatedAt: expect.any(Date),
      })
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())
      expect(await sourceRepository.findById(created.id)).toEqual(updated)
    })

    it("github の update は shouldResetCollectedCommit: true なら last_collected_commit_sha を null にする", async () => {
      const created = await createSource(sourceRepository, GITHUB_INPUT)
      await testDb.update(sources).set({ lastCollectedCommitSha: "abc123" }).where(eq(sources.id, created.id))
      const input: GitHubRepositoryInput = { ...GITHUB_INPUT, branch: "canary", includeGlobs: ["docs/**/*.md"] }

      const updated = await updateSource(sourceRepository, created.id, input, { ...NO_RESET, shouldResetCollectedCommit: true })

      expect(updated).toMatchObject({ branch: "canary", includeGlobs: ["docs/**/*.md"], lastCollectedCommitSha: null })
      const [row] = await testDb.select().from(sources).where(eq(sources.id, created.id))
      expect(row).toMatchObject({ branch: "canary", includeGlobs: ["docs/**/*.md"], lastCollectedCommitSha: null })
    })

    it("website の update は渡した列を書く", async () => {
      const created = await createSource(sourceRepository, WEBSITE_INPUT)
      const input: WebsiteInput = {
        ...WEBSITE_INPUT,
        contentSelector: null,
        excludeGlobs: [],
        excludeSelectors: [],
        includeGlobs: ["/doc/tutorial/**"],
        isEnabled: false,
      }

      const updated = await updateSource(sourceRepository, created.id, input, NO_RESET)

      expect(updated).toEqual({
        ...omitTagIds(input),
        id: created.id,
        lastCollectedAt: null,
        tags: [],
        createdAt: created.createdAt,
        updatedAt: expect.any(Date),
      })
      expect(await sourceRepository.findById(created.id)).toEqual(updated)
    })

    it("create に tagIds を渡すと source_tags に入り、create / findById / findAll はタグを lower(name) → id の順で返す", async () => {
      const react = await insertTag("react")
      const frontend = await insertTag("Frontend", "rose")

      const created = await createSource(sourceRepository, { ...GITHUB_INPUT, tagIds: [react.id, frontend.id] })

      expect(created.tags).toEqual([frontend, react])
      expect(await sourceRepository.findById(created.id)).toEqual(created)
      expect(await sourceRepository.findAll()).toEqual([created])
      expect(await selectSourceTagIds(created.id)).toEqual([react.id, frontend.id])
    })

    it("update は tagIds に付け替え（外したタグの紐付けが消え、足したタグが付く）、ほかのソースの紐付けは変えない", async () => {
      const react = await insertTag("react")
      const frontend = await insertTag("frontend", "rose")
      const hooks = await insertTag("hooks", "emerald")
      const created = await createSource(sourceRepository, { ...GITHUB_INPUT, tagIds: [react.id, frontend.id] })
      const other = await createSource(sourceRepository, { ...WEBSITE_INPUT, tagIds: [react.id, frontend.id] })

      const updated = await updateSource(sourceRepository, created.id, { ...GITHUB_INPUT, tagIds: [react.id, hooks.id] }, NO_RESET)

      expect(updated.tags).toEqual([hooks, react])
      expect(await selectSourceTagIds(created.id)).toEqual([react.id, hooks.id])
      expect(await selectSourceTagIds(other.id)).toEqual([react.id, frontend.id])
      expect(await sourceRepository.findById(other.id)).toEqual(other)
    })

    it("tagIds: [] で update するとタグが全部外れる（タグ自体は残る）", async () => {
      const react = await insertTag("react")
      const created = await createSource(sourceRepository, { ...GITHUB_INPUT, tagIds: [react.id] })

      const updated = await updateSource(sourceRepository, created.id, { ...GITHUB_INPUT, tagIds: [] }, NO_RESET)

      expect(updated.tags).toEqual([])
      expect(await selectSourceTagIds(created.id)).toEqual([])
      expect(await testDb.select().from(tags)).toEqual([react])
    })

    it("findAll はタグの無いソースに tags: [] を返す", async () => {
      const react = await insertTag("react")
      const github = await createSource(sourceRepository, { ...GITHUB_INPUT, tagIds: [react.id] })
      const website = await createSource(sourceRepository, WEBSITE_INPUT)

      const found = await sourceRepository.findAll()

      expect(found.map((source) => ({ id: source.id, tags: source.tags }))).toEqual([
        { id: github.id, tags: [react] },
        { id: website.id, tags: [] },
      ])
    })

    it("タグを消すと、そのタグがソースのタグから外れ、ソースは残る（CASCADE）", async () => {
      const react = await insertTag("react")
      const frontend = await insertTag("frontend", "rose")
      const created = await createSource(sourceRepository, { ...GITHUB_INPUT, tagIds: [react.id, frontend.id] })

      await testDb.delete(tags).where(eq(tags.id, react.id))

      expect(await sourceRepository.findById(created.id)).toEqual({ ...created, tags: [frontend] })
      expect(await selectSourceTagIds(created.id)).toEqual([frontend.id])
    })

    it("hasSourceDocuments は source_documents が 1 件でもあれば true、無ければ false", async () => {
      const github = await createSource(sourceRepository, GITHUB_INPUT)
      const website = await createSource(sourceRepository, WEBSITE_INPUT)
      await insertSourceDocument(github.id, "src/content/learn/a.md")

      expect(await sourceRepository.hasSourceDocuments(github.id)).toBe(true)
      expect(await sourceRepository.hasSourceDocuments(website.id)).toBe(false)
    })

    it("countPassagesBySource が source_documents と passages の内容と一致する", async () => {
      const github = await createSource(sourceRepository, GITHUB_INPUT)
      const website = await createSource(sourceRepository, WEBSITE_INPUT)
      const learn = await insertSourceDocument(github.id, "src/content/learn/a.md")
      const reference = await insertSourceDocument(github.id, "src/content/reference/b.md")
      await insertPassages(learn.id, "collected", 2)
      await insertPassages(learn.id, "draft", 1)
      await insertPassages(reference.id, "collected", 1)
      await insertPassages(reference.id, "published", 1)
      const fetchedPage = await insertSourceDocument(website.id, "/doc/d")
      await insertPassages(fetchedPage.id, "rejected", 1)

      expect(sortCountRows(await sourceRepository.countPassagesBySource())).toEqual([
        { count: 3, sourceId: github.id, status: "collected" },
        { count: 1, sourceId: github.id, status: "draft" },
        { count: 1, sourceId: github.id, status: "published" },
        { count: 1, sourceId: website.id, status: "rejected" },
      ])
      expect(sortCountRows(await sourceRepository.countPassagesBySource(github.id))).toEqual([
        { count: 3, sourceId: github.id, status: "collected" },
        { count: 1, sourceId: github.id, status: "draft" },
        { count: 1, sourceId: github.id, status: "published" },
      ])
    })

    it("本文候補が無ければ集計は空になる", async () => {
      const github = await createSource(sourceRepository, GITHUB_INPUT)

      expect(await sourceRepository.countPassagesBySource()).toEqual([])
      expect(await sourceRepository.countPassagesBySource(github.id)).toEqual([])
    })
  })

  describe("異常系", () => {
    it("findById / findByRepository / findBySiteUrl は該当が無ければ null を返す", async () => {
      expect(await sourceRepository.findById(999999)).toBeNull()
      expect(await sourceRepository.findByRepository("owner/none")).toBeNull()
      expect(await sourceRepository.findBySiteUrl("https://none.example.com")).toBeNull()
    })

    it("update は存在しない id で throw する", async () => {
      await expect(
        sourceRepository.update(999999, GITHUB_INPUT, NO_RESET),
      ).rejects.toThrow()
    })

    it("update は取得方法が違う行を対象にせず throw し、行は変わらない", async () => {
      const created = await createSource(sourceRepository, GITHUB_INPUT)

      await expect(
        sourceRepository.update(created.id, WEBSITE_INPUT, NO_RESET),
      ).rejects.toThrow()
      expect(await sourceRepository.findById(created.id)).toEqual(created)
    })

    it("create は登録済みの repository / site_url なら throw せず duplicate を返し、行を増やさない（unique 制約）", async () => {
      await createSource(sourceRepository, GITHUB_INPUT)
      await createSource(sourceRepository, WEBSITE_INPUT)

      expect(await sourceRepository.create({ ...GITHUB_INPUT, name: "dup" })).toEqual({ kind: "duplicate" })
      expect(await sourceRepository.create({ ...WEBSITE_INPUT, name: "dup" })).toEqual({ kind: "duplicate" })
      expect(await testDb.select().from(sources)).toHaveLength(2)
    })

    it("update は別のソースの repository / site_url にすると throw せず duplicate を返し、行は変わらない（unique 制約）", async () => {
      await createSource(sourceRepository, GITHUB_INPUT)
      await createSource(sourceRepository, WEBSITE_INPUT)
      const otherGitHub = await createSource(sourceRepository, { ...GITHUB_INPUT, repository: "vercel/next.js" })
      const otherWebsite = await createSource(sourceRepository, { ...WEBSITE_INPUT, siteUrl: "https://docs.python.org" })

      expect(await sourceRepository.update(otherGitHub.id, GITHUB_INPUT, NO_RESET)).toEqual({ kind: "duplicate" })
      expect(await sourceRepository.update(otherWebsite.id, WEBSITE_INPUT, NO_RESET)).toEqual({ kind: "duplicate" })
      expect(await sourceRepository.findById(otherGitHub.id)).toEqual(otherGitHub)
      expect(await sourceRepository.findById(otherWebsite.id)).toEqual(otherWebsite)
    })

    it("create は存在しない tag の id なら throw せず missing_tags を返し、sources の行も作らない（巻き戻る）", async () => {
      const react = await insertTag("react")

      const result = await sourceRepository.create({ ...GITHUB_INPUT, tagIds: [react.id, react.id + 1000] })

      expect(result).toEqual({ kind: "missing_tags" })
      expect(await testDb.select().from(sources)).toHaveLength(0)
      expect(await testDb.select().from(sourceTags)).toHaveLength(0)
    })

    it("update は存在しない tag の id なら throw せず missing_tags を返し、ソースの列もタグも変わらない", async () => {
      const react = await insertTag("react")
      const created = await createSource(sourceRepository, { ...GITHUB_INPUT, tagIds: [react.id] })

      const result = await sourceRepository.update(
        created.id,
        { ...GITHUB_INPUT, name: "React Docs", tagIds: [react.id + 1000] },
        NO_RESET,
      )

      expect(result).toEqual({ kind: "missing_tags" })
      expect(await sourceRepository.findById(created.id)).toEqual(created)
      expect(await selectSourceTagIds(created.id)).toEqual([react.id])
    })

    it("update が duplicate を返したときは、タグの付け替えも巻き戻る", async () => {
      const react = await insertTag("react")
      const hooks = await insertTag("hooks", "emerald")
      await createSource(sourceRepository, GITHUB_INPUT)
      const other = await createSource(sourceRepository, { ...GITHUB_INPUT, repository: "vercel/next.js", tagIds: [react.id] })

      const result = await sourceRepository.update(other.id, { ...GITHUB_INPUT, tagIds: [hooks.id] }, NO_RESET)

      expect(result).toEqual({ kind: "duplicate" })
      expect(await sourceRepository.findById(other.id)).toEqual(other)
      expect(await selectSourceTagIds(other.id)).toEqual([react.id])
    })
  })
})
