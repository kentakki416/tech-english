import { contentSources, eq, passages, sourceDocuments, sql } from "@repo/db"
import type { PassageBlock } from "@repo/domain"

import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

/**
 * content_sources / source_documents / passages の制約を実 DB で確かめる（docs/spec/content-collection/tasks/step1-db-content-sources.md）。
 * 定数に無い値は Drizzle の型で弾かれるので、sql の生 insert で入れる
 */

type ContentSourceInsert = typeof contentSources.$inferInsert
type PassageInsert = typeof passages.$inferInsert

/**
 * Postgres のエラーコード（SQLSTATE）
 */
const CHECK_VIOLATION = "23514"
const FOREIGN_KEY_VIOLATION = "23503"
const UNIQUE_VIOLATION = "23505"

/**
 * 指定した制約で失敗したことを表す matcher。Drizzle は pg のエラーを DrizzleQueryError の cause に入れる。
 * 文言ではなく SQLSTATE と制約名で判定する（別の理由で失敗したのを見逃さないため）
 */
const buildViolationMatcher = (code: string, constraint: string) => ({
  cause: expect.objectContaining({ code, constraint }),
})

const GITHUB_SOURCE = {
  branch: "main",
  fetchType: "github_repository",
  includeGlobs: ["src/content/**/*.md"],
  kind: "docs",
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
  name: "React 公式ドキュメント",
  repository: "reactjs/react.dev",
} satisfies ContentSourceInsert

const WEBSITE_SOURCE = {
  fetchType: "website",
  includeGlobs: ["/doc/**"],
  kind: "docs",
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://go.dev/copyright",
  name: "Go 公式ドキュメント",
  sitemapUrl: "https://go.dev/sitemap.xml",
  siteUrl: "https://go.dev",
} satisfies ContentSourceInsert

const BLOCKS: PassageBlock[] = [
  { text: "Effects", type: "heading" },
  { text: "Use `useEffect` to synchronize with an external system.", type: "paragraph" },
  { lang: "js", text: "useEffect(() => {}, [])", type: "code" },
  { text: "A plain code block", type: "code" },
]

const insertSource = async (values: ContentSourceInsert) => {
  const [row] = await testDb.insert(contentSources).values(values).returning()
  return row
}

const insertSourceDocument = async (sourceId: number, path = "src/content/learn/index.md") => {
  const [row] = await testDb.insert(sourceDocuments).values({ path, sourceId }).returning()
  return row
}

/**
 * passages を必須列だけで入れる
 */
const insertPassage = async (sourceDocumentId: number, overrides: Partial<PassageInsert> = {}) => {
  const [row] = await testDb
    .insert(passages)
    .values({
      blocks: BLOCKS,
      contentHash: "hash-1",
      sourceDocumentId,
      sourcePath: "src/content/learn/index.md",
      sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
      title: "Effects",
      wordCount: 320,
      ...overrides,
    })
    .returning()
  return row
}

/**
 * 定数に無い値を入れるための生 insert。kind / fetch_type / license_spdx 以外は github_repository として正しい値にする
 */
const insertRawSource = async (columns: { fetchType: string; kind: string; licenseSpdx: string }) =>
  testDb.execute(sql`
    INSERT INTO content_sources (name, kind, fetch_type, include_globs, license_spdx, license_url, repository, branch, updated_at)
    VALUES ('Raw', ${columns.kind}, ${columns.fetchType}, '["docs/**"]', ${columns.licenseSpdx}, 'https://example.com/LICENSE', 'example/raw', 'main', now())
  `)

/**
 * 定数に無い値を入れるための生 insert。status / difficulty 以外は正しい値にする
 */
const insertRawPassage = async (sourceDocumentId: number, columns: { difficulty: number | null; status: string }) =>
  testDb.execute(sql`
    INSERT INTO passages (source_document_id, source_path, source_retrieved_at, title, blocks, word_count, content_hash, status, difficulty, updated_at)
    VALUES (${sourceDocumentId}, 'docs/raw.md', now(), 'Raw', '[]', 300, 'raw-hash', ${columns.status}, ${columns.difficulty}, now())
  `)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("content_sources", () => {
  describe("正常系", () => {
    it("github_repository を repository と branch つきで insert でき、jsonb と is_enabled に既定値が入る", async () => {
      const row = await insertSource(GITHUB_SOURCE)

      expect(row).toMatchObject({
        ...GITHUB_SOURCE,
        contentSelector: null,
        excludeGlobs: [],
        excludeSelectors: [],
        isEnabled: false,
        lastCollectedAt: null,
        lastCollectedCommitSha: null,
        siteUrl: null,
      })
    })

    it("website を site_url と sitemap_url だけで insert できる", async () => {
      const row = await insertSource(WEBSITE_SOURCE)

      expect(row).toMatchObject({ ...WEBSITE_SOURCE, branch: null, repository: null, startUrl: null })
    })

    it("website を site_url と start_url だけで insert できる", async () => {
      const values = { ...WEBSITE_SOURCE, sitemapUrl: null, startUrl: "https://go.dev/doc/" }

      const row = await insertSource(values)

      expect(row).toMatchObject(values)
    })

    it("website を 2 件入れても repository が NULL 同士なので unique に掛からない", async () => {
      await insertSource(WEBSITE_SOURCE)
      await insertSource({ ...WEBSITE_SOURCE, sitemapUrl: "https://docs.python.org/sitemap.xml", siteUrl: "https://docs.python.org" })

      expect(await testDb.$count(contentSources)).toBe(2)
    })

    it("github_repository を 2 件入れても site_url が NULL 同士なので unique に掛からない", async () => {
      await insertSource(GITHUB_SOURCE)
      await insertSource({ ...GITHUB_SOURCE, repository: "rust-lang/book" })

      expect(await testDb.$count(contentSources)).toBe(2)
    })
  })

  describe("異常系", () => {
    it.each([
      ["repository", { repository: null }],
      ["branch", { branch: null }],
    ])("github_repository で %s が NULL なら失敗する", async (_column, overrides) => {
      await expect(insertSource({ ...GITHUB_SOURCE, ...overrides })).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "content_sources_github_repository_check"),
      )
      expect(await testDb.$count(contentSources)).toBe(0)
    })

    it("website で site_url が NULL なら失敗する", async () => {
      await expect(insertSource({ ...WEBSITE_SOURCE, siteUrl: null })).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "content_sources_website_check"),
      )
    })

    it("website で sitemap_url と start_url が両方 NULL なら失敗する", async () => {
      await expect(insertSource({ ...WEBSITE_SOURCE, sitemapUrl: null, startUrl: null })).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "content_sources_website_check"),
      )
    })

    it.each([
      ["license_spdx が許可リストに無い（CC-BY-SA-4.0）", { fetchType: "github_repository", kind: "docs", licenseSpdx: "CC-BY-SA-4.0" }, "content_sources_license_spdx_check"],
      ["kind が定数に無い", { fetchType: "github_repository", kind: "blog", licenseSpdx: "MIT" }, "content_sources_kind_check"],
      ["fetch_type が定数に無い", { fetchType: "rss", kind: "docs", licenseSpdx: "MIT" }, "content_sources_fetch_type_check"],
    ])("%s と失敗する", async (_label, columns, constraint) => {
      await expect(insertRawSource(columns)).rejects.toMatchObject(buildViolationMatcher(CHECK_VIOLATION, constraint))
    })

    it("repository が重複すると失敗する", async () => {
      await insertSource(GITHUB_SOURCE)

      await expect(insertSource({ ...GITHUB_SOURCE, name: "別名" })).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "content_sources_repository_key"),
      )
    })

    it("site_url が重複すると失敗する", async () => {
      await insertSource(WEBSITE_SOURCE)

      await expect(insertSource({ ...WEBSITE_SOURCE, name: "別名" })).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "content_sources_site_url_key"),
      )
    })

    it("source_documents が参照している行は削除できない（restrict）", async () => {
      const source = await insertSource(GITHUB_SOURCE)
      await insertSourceDocument(source.id)

      await expect(testDb.delete(contentSources).where(eq(contentSources.id, source.id))).rejects.toMatchObject(
        buildViolationMatcher(FOREIGN_KEY_VIOLATION, "source_documents_source_id_fkey"),
      )
      expect(await testDb.$count(contentSources)).toBe(1)
    })
  })
})

describe("source_documents", () => {
  describe("正常系", () => {
    it("path と source_id だけで insert でき、取得方法ごとの列と fetched_at は NULL になる", async () => {
      const source = await insertSource(GITHUB_SOURCE)

      const row = await insertSourceDocument(source.id)

      expect(row).toMatchObject({
        blobSha: null,
        commitSha: null,
        contentHash: null,
        etag: null,
        fetchedAt: null,
        httpStatus: null,
        lastModified: null,
        path: "src/content/learn/index.md",
        sitemapLastmod: null,
        sourceId: source.id,
        title: null,
      })
    })

    it("同じ path でもソースが違えば insert できる", async () => {
      const source = await insertSource(GITHUB_SOURCE)
      const otherSource = await insertSource({ ...GITHUB_SOURCE, repository: "rust-lang/book" })
      await insertSourceDocument(source.id, "README.md")
      await insertSourceDocument(otherSource.id, "README.md")

      expect(await testDb.$count(sourceDocuments)).toBe(2)
    })
  })

  describe("異常系", () => {
    it("(source_id, path) が重複すると失敗する", async () => {
      const source = await insertSource(GITHUB_SOURCE)
      await insertSourceDocument(source.id)

      await expect(insertSourceDocument(source.id)).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "source_documents_source_id_path_key"),
      )
    })

    it("passages が参照している行は削除できない（restrict）", async () => {
      const source = await insertSource(GITHUB_SOURCE)
      const document = await insertSourceDocument(source.id)
      await insertPassage(document.id)

      await expect(testDb.delete(sourceDocuments).where(eq(sourceDocuments.id, document.id))).rejects.toMatchObject(
        buildViolationMatcher(FOREIGN_KEY_VIOLATION, "passages_source_document_id_fkey"),
      )
      expect(await testDb.$count(sourceDocuments)).toBe(1)
    })
  })
})

describe("passages", () => {
  const setupSourceDocument = async () => {
    const source = await insertSource(GITHUB_SOURCE)
    return insertSourceDocument(source.id)
  }

  describe("正常系", () => {
    it("必須列だけで insert すると、状態・生成の記録・確認の記録に既定値が入る", async () => {
      const document = await setupSourceDocument()

      const row = await insertPassage(document.id)

      expect(row).toMatchObject({
        attentionReasons: [],
        difficulty: null,
        generatedAt: null,
        generationAttemptCount: 0,
        generationError: null,
        generationModel: null,
        generationPromptVersion: null,
        generationStartedAt: null,
        needsAttention: false,
        publishedAt: null,
        rejectReason: null,
        reviewedAt: null,
        sourceCommitSha: null,
        status: "collected",
        timeLimitSeconds: null,
      })
    })

    it("blocks の jsonb が PassageBlock[] として lang の有無まで読み戻せる", async () => {
      const document = await setupSourceDocument()
      const { id } = await insertPassage(document.id)

      const [row] = await testDb.select({ blocks: passages.blocks }).from(passages).where(eq(passages.id, id))

      /**
       * toStrictEqual は lang が無いブロックに lang: undefined が入っていても失敗する
       */
      expect(row.blocks).toStrictEqual(BLOCKS)
    })

    it.each([1, 3] as const)("difficulty = %d（範囲の境界）は insert できる", async (difficulty) => {
      const document = await setupSourceDocument()

      const row = await insertPassage(document.id, { difficulty })

      expect(row.difficulty).toBe(difficulty)
    })
  })

  describe("異常系", () => {
    it.each([
      ["status が定数に無い", { difficulty: null, status: "pending" }, "passages_status_check"],
      ["difficulty = 4（範囲の外）", { difficulty: 4, status: "collected" }, "passages_difficulty_check"],
      ["difficulty = 0（範囲の外）", { difficulty: 0, status: "collected" }, "passages_difficulty_check"],
    ])("%s と失敗する", async (_label, columns, constraint) => {
      const document = await setupSourceDocument()

      await expect(insertRawPassage(document.id, columns)).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, constraint),
      )
    })

    it("content_hash が重複すると失敗する（同じソースの別の文書でも）", async () => {
      const document = await setupSourceDocument()
      const otherDocument = await insertSourceDocument(document.sourceId, "src/content/learn/other.md")
      await insertPassage(document.id)

      await expect(insertPassage(otherDocument.id, { title: "別のタイトル" })).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "passages_content_hash_key"),
      )
    })
  })
})
