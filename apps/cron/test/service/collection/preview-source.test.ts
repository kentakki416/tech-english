import { BlockedUrlError } from "../../../src/client/web"
import { previewSource } from "../../../src/service/collection"

import {
  BROKEN_MDX,
  buildBlob,
  buildGitHubSource,
  buildHtmlPage,
  buildMarkdown,
  buildOkPage,
  buildSourceDocument,
  buildWebsiteSource,
  COMMIT_SHA,
  createDeps,
  createFakeGitHubClient,
  createFakeRepo,
  createFakeWebPageClient,
} from "./helpers"

const SITE = "https://example.dev"

/**
 * Repository の書き込みメソッドが 1 つも呼ばれていないこと
 */
const expectNoWrites = (repo: ReturnType<typeof createFakeRepo>): void => {
  expect(repo.contentSourceRepository.markCollected).not.toHaveBeenCalled()
  expect(repo.passageRepository.insertIgnoringDuplicates).not.toHaveBeenCalled()
  expect(repo.sourceDocumentRepository.markFetched).not.toHaveBeenCalled()
  expect(repo.sourceDocumentRepository.markResponse).not.toHaveBeenCalled()
  expect(repo.sourceDocumentRepository.upsertByPath).not.toHaveBeenCalled()
  expect(repo.sourceDocumentRepository.upsertDiscovered).not.toHaveBeenCalled()
}

const PATHS = ["docs/a.md", "docs/b.mdx", "docs/c.md", "docs/d.md", "docs/e.md", "docs/f.md"]

describe("previewSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("無効のソースも対象にし、blob SHA に関係なく先頭 maxDocuments 件を取得して抽出する。Repository の書き込みメソッドは呼ばない", async () => {
      const client = createFakeGitHubClient({
        contents: Object.fromEntries(PATHS.map((path) => [path, path.endsWith(".mdx") ? BROKEN_MDX : buildMarkdown(["Alpha"])])),
        trees: { [`${COMMIT_SHA}?recursive=1`]: { entries: PATHS.map((path) => buildBlob(path, `blob-${path}`)) } },
      })
      const repo = createFakeRepo({
        documents: [buildSourceDocument({ blobSha: "blob-docs/a.md", path: "docs/a.md" })],
        source: buildGitHubSource({ id: 3, isEnabled: false, lastCollectedCommitSha: COMMIT_SHA, name: "Example docs" }),
      })

      const preview = await previewSource({ maxDocuments: 5, sourceId: 3 }, repo, createDeps(client))

      expect(preview).toMatchObject({
        fetchedFrom: "owner/repo @ commit-",
        isComplete: true,
        sourceId: 3,
        sourceName: "Example docs",
        targetDocumentCount: 6,
      })
      expect(preview.documents.map(({ path, status }) => ({ path, status }))).toEqual([
        { path: "docs/a.md", status: "extracted" },
        { path: "docs/b.mdx", status: "failed" },
        { path: "docs/c.md", status: "extracted" },
        { path: "docs/d.md", status: "extracted" },
        { path: "docs/e.md", status: "extracted" },
      ])
      expectNoWrites(repo)
    })

    it("website（sitemap あり）は取得してよい URL の先頭 5 件を条件付きにせず取得して抽出し、DB に書かない", async () => {
      const targetPaths = ["/doc/a", "/doc/b", "/doc/c", "/doc/d", "/doc/e", "/doc/f"]
      const client = createFakeWebPageClient({
        pages: {
          [`${SITE}/doc/a`]: buildOkPage(`${SITE}/doc/a`, buildHtmlPage({ sectionTitles: ["Alpha"], title: "A" })),
          [`${SITE}/doc/b`]: { kind: "http_error", status: 404 },
          [`${SITE}/doc/c`]: { kind: "skipped", reason: "not_html", status: 200 },
          [`${SITE}/doc/d`]: { errorMessage: "timeout", kind: "network_error" },
          [`${SITE}/doc/e`]: buildOkPage(`${SITE}/doc/e`, buildHtmlPage({ sectionTitles: ["Echo"], title: "E" })),
        },
        sitemapUrls: [
          { lastmod: null, url: `${SITE}/blog/post` },
          ...targetPaths.map((path) => ({ lastmod: null, url: `${SITE}${path}` })),
        ],
      })
      const source = buildWebsiteSource({
        contentSelector: "main",
        id: 7,
        isEnabled: false,
        name: "Example site",
        siteUrl: SITE,
        sitemapUrl: `${SITE}/sitemap.xml`,
      })
      const repo = createFakeRepo({ source })
      const deps = createDeps(createFakeGitHubClient(), () => false, client)

      const preview = await previewSource({ maxDocuments: 5, sourceId: 7 }, repo, deps)

      expect(deps.createWebPageClient).toHaveBeenCalledWith(SITE)
      expect(client.loadRobots).toHaveBeenCalledTimes(1)
      expect(client.fetchPage.mock.calls).toEqual(
        targetPaths.slice(0, 5).map((path) => [`${SITE}${path}`, { etag: null, lastModified: null }]),
      )
      expect(preview).toMatchObject({
        fetchedFrom: `${SITE}（sitemap: ${SITE}/sitemap.xml）`,
        isComplete: true,
        sourceId: 7,
        sourceName: "Example site",
        targetDocumentCount: 6,
      })
      expect(preview.documents).toEqual([
        expect.objectContaining({ path: "/doc/a", status: "extracted" }),
        { path: "/doc/b", reason: "HTTP 404", status: "not_fetched" },
        { path: "/doc/c", reason: "not_html（HTTP 200）", status: "not_fetched" },
        { path: "/doc/d", reason: "ネットワークエラー（timeout）", status: "not_fetched" },
        expect.objectContaining({ path: "/doc/e", status: "extracted" }),
      ])
      expectNoWrites(repo)
    })

    it("website（sitemap なし）は開始ページからリンクを幅優先でたどり、取得するページは開始ページを含めて 5 件以下", async () => {
      const client = createFakeWebPageClient({
        pages: {
          [`${SITE}/start/`]: buildOkPage(`${SITE}/start/`, buildHtmlPage({
            links: ["/doc/a", "/blog/post", "/doc/b", "/doc/a#top"],
            sectionTitles: ["Welcome"],
          })),
          [`${SITE}/doc/a`]: buildOkPage(`${SITE}/doc/a`, buildHtmlPage({ links: ["/doc/c", "/doc/d"], sectionTitles: ["Alpha"] })),
          [`${SITE}/doc/b`]: buildOkPage(`${SITE}/doc/b`, buildHtmlPage({ links: ["/doc/e", "/doc/f"], sectionTitles: ["Bravo"] })),
          [`${SITE}/doc/c`]: buildOkPage(`${SITE}/doc/c`, buildHtmlPage({ sectionTitles: ["Charlie"] })),
          [`${SITE}/doc/d`]: buildOkPage(`${SITE}/doc/d`, buildHtmlPage({ sectionTitles: ["Delta"] })),
        },
      })
      const source = buildWebsiteSource({ contentSelector: "main", id: 8, siteUrl: SITE, sitemapUrl: null, startUrl: `${SITE}/start/` })
      const repo = createFakeRepo({ source })

      const preview = await previewSource({ maxDocuments: 5, sourceId: 8 }, repo, createDeps(createFakeGitHubClient(), () => false, client))

      expect(client.fetchPage.mock.calls.map(([url]) => url)).toEqual([
        `${SITE}/start/`,
        `${SITE}/doc/a`,
        `${SITE}/doc/b`,
        `${SITE}/doc/c`,
        `${SITE}/doc/d`,
      ])
      expect(preview.documents.map(({ path, status }) => ({ path, status }))).toEqual([
        { path: "/doc/a", status: "extracted" },
        { path: "/doc/b", status: "extracted" },
        { path: "/doc/c", status: "extracted" },
        { path: "/doc/d", status: "extracted" },
      ])
      expect(preview.fetchedFrom).toBe(`${SITE}（開始ページ ${SITE}/start/ からリンクをたどる）`)
      expect(preview.targetDocumentCount).toBe(6)
      expectNoWrites(repo)
    })
  })

  describe("異常系", () => {
    it("ソースが存在しなければ throw する", async () => {
      const repo = createFakeRepo({ source: null })

      await expect(previewSource({ maxDocuments: 5, sourceId: 9 }, repo, createDeps(createFakeGitHubClient())))
        .rejects.toThrow("Content source not found: id=9")
    })

    it("website で取得先の制限に掛かったら BlockedUrlError をそのまま throw する", async () => {
      const githubClient = createFakeGitHubClient()
      const client = createFakeWebPageClient({ loadRobotsError: new BlockedUrlError("localhost") })
      const repo = createFakeRepo({ source: buildWebsiteSource({ id: 2, siteUrl: "https://localhost" }) })

      await expect(previewSource({ maxDocuments: 5, sourceId: 2 }, repo, createDeps(githubClient, () => false, client)))
        .rejects.toBeInstanceOf(BlockedUrlError)
      expect(githubClient.getLatestCommitSha).not.toHaveBeenCalled()
      expect(client.fetchPage).not.toHaveBeenCalled()
    })
  })
})
