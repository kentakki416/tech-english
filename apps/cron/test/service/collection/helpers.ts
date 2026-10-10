import type { ContentSource, GitHubRepositorySource, SourceDocument, WebsiteSource } from "@repo/domain"

import type { GitHubTreeEntry, IGitHubContentClient } from "../../../src/client/github"
import type { CreatePassageInput, MarkFetchedInput } from "../../../src/repository"

export const NOW = new Date("2026-10-10T03:00:00.000Z")

export const COMMIT_SHA = "commit-sha-latest"

const CREATED_AT = new Date("2026-10-01T00:00:00.000Z")

export const buildGitHubSource = (overrides: Partial<GitHubRepositorySource> = {}): GitHubRepositorySource => ({
  id: 1,
  branch: "main",
  excludeGlobs: [],
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
  tags: [],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
})

export const buildWebsiteSource = (overrides: Partial<WebsiteSource> = {}): WebsiteSource => ({
  id: 2,
  contentSelector: null,
  excludeGlobs: [],
  excludeSelectors: [],
  fetchType: "website",
  includeGlobs: ["/doc/**"],
  isEnabled: true,
  kind: "docs",
  lastCollectedAt: null,
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://example.dev/license",
  name: "Example site",
  sitemapUrl: "https://example.dev/sitemap.xml",
  siteUrl: "https://example.dev",
  startUrl: null,
  tags: [],
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
})

export const buildSourceDocument = (overrides: Partial<SourceDocument> = {}): SourceDocument => ({
  id: 100,
  blobSha: null,
  commitSha: null,
  contentHash: null,
  etag: null,
  fetchedAt: null,
  httpStatus: null,
  lastModified: null,
  path: "docs/a.md",
  sitemapLastmod: null,
  sourceId: 1,
  title: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
})

export const buildBlob = (path: string, sha: string, size = 1_000): GitHubTreeEntry => ({ path, sha, size, type: "blob" })

export const buildTree = (path: string, sha: string): GitHubTreeEntry => ({ path, sha, size: null, type: "tree" })

/**
 * 英単語を count 語並べた文（見分けが付くよう単語を変えられる）
 */
const buildWords = (word: string, count: number): string => Array.from({ length: count }, () => word).join(" ")

/**
 * h1 のタイトルと、見出し + 300 語の節を並べた Markdown。節ごとに 1 つの本文候補になる（h1 は最初の節に結合される）
 */
export const buildMarkdown = (sectionTitles: string[]): string =>
  [
    "# Doc",
    ...sectionTitles.map((title) => `## ${title}\n\n${buildWords(title.toLowerCase(), 299)}.\n`),
  ].join("\n")

/**
 * 閉じていない JSX。remark-mdx が throw する
 */
export const BROKEN_MDX = "# Title\n\n<Sandpack>\n\nThe component is never closed.\n"

export type FakeTree = { entries: GitHubTreeEntry[]; isTruncated?: boolean }

export type FakeGitHubOptions = {
  commitSha?: string
  /**
   * path → 本文
   */
  contents?: Record<string, string>
  /**
   * rate limit の残りの初期値。リクエストのたびに 1 減る。null（既定）は常に null を返す
   */
  rateLimitRemaining?: number | null
  /**
   * 非再帰は `{sha}`、再帰は `{sha}?recursive=1` をキーにする
   */
  trees?: Record<string, FakeTree>
}

/**
 * GitHubContentClient の偽物。登録されていないファイル・ツリーを取りに来たら throw する
 */
export const createFakeGitHubClient = (options: FakeGitHubOptions = {}) => {
  let remaining = options.rateLimitRemaining ?? null
  const consume = (): void => {
    if (remaining !== null) remaining -= 1
  }
  return {
    getFileContent: vi.fn<IGitHubContentClient["getFileContent"]>(async (_repository, path) => {
      consume()
      const content = options.contents?.[path]
      if (content === undefined) throw new Error(`Unexpected file: ${path}`)
      return content
    }),
    getLatestCommitSha: vi.fn<IGitHubContentClient["getLatestCommitSha"]>(async () => {
      consume()
      return options.commitSha ?? COMMIT_SHA
    }),
    getRateLimitRemaining: vi.fn<IGitHubContentClient["getRateLimitRemaining"]>(() => remaining),
    getTree: vi.fn<IGitHubContentClient["getTree"]>(async (_repository, treeSha, { isRecursive }) => {
      consume()
      const tree = options.trees?.[isRecursive ? `${treeSha}?recursive=1` : treeSha]
      if (!tree) throw new Error(`Unexpected tree: ${treeSha} (recursive: ${isRecursive})`)
      return { entries: tree.entries, isTruncated: tree.isTruncated ?? false }
    }),
  }
}

/**
 * Repository の偽物。upsertByPath は 100 から順に id を振った行を返し、insertIgnoringDuplicates は渡した件数を返す
 */
export const createFakeRepo = (options: {
  documents?: SourceDocument[]
  enabledSources?: ContentSource[]
  source?: ContentSource | null
} = {}) => {
  let nextDocumentId = 100
  return {
    contentSourceRepository: {
      findById: vi.fn(async (_id: number) => options.source ?? null),
      findEnabled: vi.fn(async () => options.enabledSources ?? []),
      markCollected: vi.fn(async (_id: number, _input: { lastCollectedAt: Date; lastCollectedCommitSha?: string }) => undefined),
    },
    passageRepository: {
      insertIgnoringDuplicates: vi.fn(async (inputs: CreatePassageInput[]) => inputs.length),
    },
    sourceDocumentRepository: {
      findBySourceId: vi.fn(async (_sourceId: number) => options.documents ?? []),
      markFetched: vi.fn(async (_id: number, _input: MarkFetchedInput) => undefined),
      upsertByPath: vi.fn(async (input: { path: string; sourceId: number; title: string | null }) => {
        const id = nextDocumentId
        nextDocumentId += 1
        return buildSourceDocument({ id, path: input.path, sourceId: input.sourceId, title: input.title })
      }),
    },
  }
}

export const createDeps = (githubContentClient: ReturnType<typeof createFakeGitHubClient>, isShuttingDown = () => false) => ({
  githubContentClient,
  isShuttingDown: vi.fn(isShuttingDown),
})
