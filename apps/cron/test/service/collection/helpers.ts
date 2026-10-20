import type { FetchPageResult, IWebPageClient, SitemapUrl } from "@repo/content-extractor"
import type { ContentSource, GitHubRepositorySource, SourceDocument, WebsiteSource } from "@repo/domain"

import type { GitHubTreeEntry, IGitHubContentClient } from "../../../src/client/github"
import type {
  CreatePassageInput,
  DiscoveredDocumentInput,
  MarkCollectedInput,
  MarkFetchedInput,
} from "../../../src/repository"

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
  lastCollectedExtractionVersion: null,
  licenseSpdx: "MIT",
  licenseUrl: "https://github.com/owner/repo/blob/main/LICENSE",
  name: "Example docs",
  publicUrlStripPrefix: null,
  publicUrlTemplate: null,
  repository: "owner/repo",
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
  extractionVersion: null,
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
 * サイトのページの HTML。nav にリンク、main に h1 と「見出し + 300 語」の節を並べる（節ごとに 1 つの本文候補になる）。
 * 本文の CSS セレクタを main にしたソースで使う
 */
export const buildHtmlPage = (input: { links?: string[]; sectionTitles: string[]; title?: string }): string => {
  const title = input.title ?? "Doc"
  const links = (input.links ?? []).map((href) => `<a href="${href}">${href}</a>`).join(" ")
  const sections = input.sectionTitles
    .map((sectionTitle) => `<h2>${sectionTitle}</h2><p>${buildWords(sectionTitle.toLowerCase(), 299)}.</p>`)
    .join("")
  return `<!doctype html><html><head><title>${title}</title></head><body><nav>${links}</nav><main><h1>${title}</h1>${sections}</main></body></html>`
}

/**
 * fetchPage の ok の結果
 */
export const buildOkPage = (
  finalUrl: string,
  body: string,
  overrides: Partial<Extract<FetchPageResult, { kind: "ok" }>> = {},
): FetchPageResult => ({ body, etag: null, finalUrl, kind: "ok", lastModified: null, status: 200, ...overrides })

export type FakeWebPageClientOptions = {
  /**
   * robots.txt で禁止する pathname の接頭辞
   */
  disallowedPathPrefixes?: string[]
  loadRobotsError?: Error
  /**
   * URL → fetchPage の結果（Error なら throw する）
   */
  pages?: Record<string, Error | FetchPageResult>
  sitemapUrls?: SitemapUrl[]
}

/**
 * WebPageClient の偽物。登録されていないページを取りに来たら throw する
 */
export const createFakeWebPageClient = (options: FakeWebPageClientOptions = {}) => ({
  fetchPage: vi.fn<IWebPageClient["fetchPage"]>(async (url) => {
    const result = options.pages?.[url]
    if (result === undefined) throw new Error(`Unexpected page: ${url}`)
    if (result instanceof Error) throw result
    return result
  }),
  fetchSitemapUrls: vi.fn<IWebPageClient["fetchSitemapUrls"]>(async () => options.sitemapUrls ?? []),
  isAllowedByRobots: vi.fn<IWebPageClient["isAllowedByRobots"]>((url) => {
    const { pathname } = new URL(url)
    return !(options.disallowedPathPrefixes ?? []).some((prefix) => pathname.startsWith(prefix))
  }),
  loadRobots: vi.fn<IWebPageClient["loadRobots"]>(async () => {
    if (options.loadRobotsError) throw options.loadRobotsError
  }),
})

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
 * Repository の偽物。upsertByPath は 100 から順に id を振った行を返し、insertIgnoringDuplicates は渡した件数を返す。
 * markCollected は既定で true（行を更新できた）を返し、rejectCollected は既定で 0 を返す
 */
export const createFakeRepo = (options: {
  documents?: SourceDocument[]
  /**
   * findWithCollectedPassages が返す行
   */
  documentsWithCollectedPassages?: SourceDocument[]
  enabledSources?: ContentSource[]
  /**
   * findGeneratedOrGeneratingTitles が返す見出し
   */
  generatedTitles?: string[]
  /**
   * findFetchQueue が返す行
   */
  queue?: SourceDocument[]
  rejectedCount?: number
  source?: ContentSource | null
} = {}) => {
  let nextDocumentId = 100
  return {
    contentSourceRepository: {
      findById: vi.fn(async (_id: number) => options.source ?? null),
      findEnabled: vi.fn(async () => options.enabledSources ?? []),
      markCollected: vi.fn(async (_id: number, _input: MarkCollectedInput) => true),
    },
    passageRepository: {
      findGeneratedOrGeneratingTitles: vi.fn(async (_sourceDocumentId: number) => options.generatedTitles ?? []),
      insertIgnoringDuplicates: vi.fn(async (inputs: CreatePassageInput[]) => inputs.length),
      rejectCollected: vi.fn(async (_input: { keepContentHashes: string[]; reason: string; sourceDocumentIds: number[] }) =>
        options.rejectedCount ?? 0),
    },
    sourceDocumentRepository: {
      findBySourceId: vi.fn(async (_sourceId: number) => options.documents ?? []),
      findFetchQueue: vi.fn(async (_input: { limit: number; refetchBefore: Date; sourceId: number }) => options.queue ?? []),
      findWithCollectedPassages: vi.fn(async (_sourceId: number) => options.documentsWithCollectedPassages ?? []),
      markFetched: vi.fn(async (_id: number, _input: MarkFetchedInput) => undefined),
      markResponse: vi.fn(async (_id: number, _input: { fetchedAt: Date; httpStatus: number | null }) => undefined),
      upsertByPath: vi.fn(async (input: { path: string; sourceId: number; title: string | null }) => {
        const id = nextDocumentId
        nextDocumentId += 1
        return buildSourceDocument({ id, path: input.path, sourceId: input.sourceId, title: input.title })
      }),
      upsertDiscovered: vi.fn(async (
        _sourceId: number,
        _inputs: DiscoveredDocumentInput[],
        _options: { shouldReviveGone: boolean },
      ) => undefined),
    },
  }
}

export const createDeps = (
  githubContentClient: ReturnType<typeof createFakeGitHubClient>,
  webPageClient: ReturnType<typeof createFakeWebPageClient> = createFakeWebPageClient(),
) => ({
  createWebPageClient: vi.fn((_origin: string) => webPageClient),
  githubContentClient,
})
