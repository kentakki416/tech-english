import { previewSource } from "../../../src/service/collection"

import {
  BROKEN_MDX,
  buildBlob,
  buildGitHubSource,
  buildMarkdown,
  buildSourceDocument,
  buildWebsiteSource,
  COMMIT_SHA,
  createDeps,
  createFakeGitHubClient,
  createFakeRepo,
} from "./helpers"

/**
 * Repository の書き込みメソッドが 1 つも呼ばれていないこと
 */
const expectNoWrites = (repo: ReturnType<typeof createFakeRepo>): void => {
  expect(repo.sourceRepository.markCollected).not.toHaveBeenCalled()
  expect(repo.passageRepository.insertIgnoringDuplicates).not.toHaveBeenCalled()
  expect(repo.sourceDocumentRepository.markFetched).not.toHaveBeenCalled()
  expect(repo.sourceDocumentRepository.upsertByPath).not.toHaveBeenCalled()
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
  })

  describe("異常系", () => {
    it("ソースが存在しなければ throw する", async () => {
      const repo = createFakeRepo({ source: null })

      await expect(previewSource({ maxDocuments: 5, sourceId: 9 }, repo, createDeps(createFakeGitHubClient())))
        .rejects.toThrow("Source not found: id=9")
    })

    it("サイトのソースは無効でも取得せずに throw する", async () => {
      const githubClient = createFakeGitHubClient()
      const repo = createFakeRepo({ source: buildWebsiteSource({ id: 2, isEnabled: false }) })

      await expect(previewSource({ maxDocuments: 5, sourceId: 2 }, repo, createDeps(githubClient)))
        .rejects.toThrow("Website sources are not collected: id=2")
      expect(githubClient.getLatestCommitSha).not.toHaveBeenCalled()
    })
  })
})
