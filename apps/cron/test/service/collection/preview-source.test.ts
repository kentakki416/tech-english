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
      expect(repo.contentSourceRepository.markCollected).not.toHaveBeenCalled()
      expect(repo.passageRepository.insertIgnoringDuplicates).not.toHaveBeenCalled()
      expect(repo.sourceDocumentRepository.markFetched).not.toHaveBeenCalled()
      expect(repo.sourceDocumentRepository.upsertByPath).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("ソースが存在しなければ throw する", async () => {
      const repo = createFakeRepo({ source: null })

      await expect(previewSource({ maxDocuments: 5, sourceId: 9 }, repo, createDeps(createFakeGitHubClient())))
        .rejects.toThrow("Content source not found: id=9")
    })

    it("website のソースは未対応なので throw する", async () => {
      const client = createFakeGitHubClient()
      const repo = createFakeRepo({ source: buildWebsiteSource({ id: 2 }) })

      await expect(previewSource({ maxDocuments: 5, sourceId: 2 }, repo, createDeps(client)))
        .rejects.toThrow("not supported yet")
      expect(client.getLatestCommitSha).not.toHaveBeenCalled()
    })
  })
})
