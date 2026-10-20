import { extractDocument, EXTRACTION_VERSION } from "@repo/content-extractor"
import { SUPERSEDED_PASSAGE_REJECT_REASON } from "@repo/domain"

import { GitHubRateLimitError } from "../../../src/client/github"
import {
  MAX_MARKDOWN_FILE_BYTES,
  OUT_OF_TARGET_PASSAGE_REJECT_REASON,
} from "../../../src/const/collection"
import { collectGitHubSource, type CollectGitHubSourceInput } from "../../../src/service/collection"

import {
  BROKEN_MDX,
  buildBlob,
  buildGitHubSource,
  buildMarkdown,
  buildSourceDocument,
  buildTree,
  COMMIT_SHA,
  createDeps,
  createFakeGitHubClient,
  createFakeRepo,
  type FakeGitHubOptions,
  NOW,
} from "./helpers"

/**
 * commit SHA を書けなかったときの warn を確かめるため logger を差し替える（@repo/logger の logger は Proxy で spyOn できない）
 */
const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }))
vi.mock("@repo/logger", () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: warnMock } }))

const buildInput = (overrides: Partial<CollectGitHubSourceInput> = {}): CollectGitHubSourceInput => ({
  maxDocuments: 100,
  maxPassages: 200,
  minRateLimitRemaining: 100,
  now: NOW,
  source: buildGitHubSource(),
  ...overrides,
})

/**
 * docs/ に Markdown（本文候補 2 件ずつ。ファイルごとに単語を変えて content_hash を分ける）を並べたコミット
 */
const buildGitHubOptions = (paths: string[], overrides: Partial<FakeGitHubOptions> = {}): FakeGitHubOptions => ({
  contents: Object.fromEntries(paths.map((path, index) => {
    const suffix = String.fromCharCode("a".charCodeAt(0) + index)
    return [path, buildMarkdown([`Alpha${suffix}`, `Beta${suffix}`])]
  })),
  trees: {
    [`${COMMIT_SHA}?recursive=1`]: {
      entries: [buildTree("docs", "tree-docs"), ...paths.map((path) => buildBlob(path, `blob-${path}`))],
    },
  },
  ...overrides,
})

describe("collectGitHubSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("最新コミットと抽出の版が前回と同じなら up_to_date で、ツリーを取らず、却下もせず、commit SHA を渡さずに markCollected する", async () => {
      const client = createFakeGitHubClient()
      const repo = createFakeRepo()

      const result = await collectGitHubSource(
        buildInput({
          source: buildGitHubSource({ lastCollectedCommitSha: COMMIT_SHA, lastCollectedExtractionVersion: EXTRACTION_VERSION }),
        }),
        repo,
        createDeps(client),
      )

      expect(result).toEqual({ createdPassageCount: 0, fetchedDocumentCount: 0, status: "up_to_date" })
      expect(client.getLatestCommitSha).toHaveBeenCalledWith("owner/repo", "main")
      expect(client.getTree).not.toHaveBeenCalled()
      expect(repo.sourceDocumentRepository.findWithCollectedPassages).not.toHaveBeenCalled()
      expect(repo.contentSourceRepository.markCollected).toHaveBeenCalledWith(1, { lastCollectedAt: NOW })
    })

    it("最新コミットが前回と同じでも抽出の版が違えばツリーを取り、blob SHA が同じでも版が古いファイルを取り直し、版も同じファイルは取らない", async () => {
      const client = createFakeGitHubClient(buildGitHubOptions(["docs/a.md", "docs/b.md", "docs/c.md"]))
      const repo = createFakeRepo({
        documents: [
          buildSourceDocument({ id: 1, blobSha: "blob-docs/a.md", extractionVersion: null, path: "docs/a.md" }),
          buildSourceDocument({ id: 2, blobSha: "blob-docs/b.md", extractionVersion: "2026-01-01.1", path: "docs/b.md" }),
          buildSourceDocument({ id: 3, blobSha: "blob-docs/c.md", extractionVersion: EXTRACTION_VERSION, path: "docs/c.md" }),
        ],
      })

      const result = await collectGitHubSource(
        buildInput({ source: buildGitHubSource({ lastCollectedCommitSha: COMMIT_SHA, lastCollectedExtractionVersion: "2026-01-01.1" }) }),
        repo,
        createDeps(client),
      )

      expect(client.getFileContent.mock.calls.map(([, path]) => path)).toEqual(["docs/a.md", "docs/b.md"])
      expect(result.status).toBe("completed")
      expect(repo.contentSourceRepository.markCollected).toHaveBeenCalledWith(1, {
        lastCollectedAt: NOW,
        lastCollectedCommit: { expectedSha: COMMIT_SHA, extractionVersion: EXTRACTION_VERSION, nextSha: COMMIT_SHA },
      })
    })

    it("ツリーに無い文書と、除外パスに入った文書の collected を、本文を取る前に却下する", async () => {
      const client = createFakeGitHubClient(buildGitHubOptions(["docs/a.md", "docs/overview.md"]))
      const repo = createFakeRepo({
        documentsWithCollectedPassages: [
          buildSourceDocument({ id: 1, path: "docs/a.md" }),
          buildSourceDocument({ id: 2, path: "docs/deleted.md" }),
          buildSourceDocument({ id: 3, path: "docs/overview.md" }),
        ],
      })

      await collectGitHubSource(
        buildInput({ source: buildGitHubSource({ excludeGlobs: ["docs/overview.md"] }) }),
        repo,
        createDeps(client),
      )

      expect(repo.sourceDocumentRepository.findWithCollectedPassages).toHaveBeenCalledWith(1)
      expect(repo.passageRepository.rejectCollected).toHaveBeenNthCalledWith(1, {
        keepContentHashes: [],
        reason: OUT_OF_TARGET_PASSAGE_REJECT_REASON,
        sourceDocumentIds: [2, 3],
      })
      expect(repo.passageRepository.rejectCollected.mock.invocationCallOrder[0])
        .toBeLessThan(client.getFileContent.mock.invocationCallOrder[0])
    })

    it("ツリーが切り詰められていたら、ツリーに無い文書のうち除外パス・対象パスに合わないものだけを却下する", async () => {
      const client = createFakeGitHubClient({
        contents: { "docs/a.md": buildMarkdown(["Alpha"]) },
        trees: { [`${COMMIT_SHA}?recursive=1`]: { entries: [buildBlob("docs/a.md", "blob-a")], isTruncated: true } },
      })
      const repo = createFakeRepo({
        documentsWithCollectedPassages: [
          buildSourceDocument({ id: 1, path: "docs/not-listed.md" }),
          buildSourceDocument({ id: 2, path: "docs/overview.md" }),
        ],
      })

      await collectGitHubSource(
        buildInput({ source: buildGitHubSource({ excludeGlobs: ["docs/overview.md"], includeGlobs: ["**/*.md"] }) }),
        repo,
        createDeps(client),
      )

      expect(repo.passageRepository.rejectCollected).toHaveBeenNthCalledWith(1, {
        keepContentHashes: [],
        reason: OUT_OF_TARGET_PASSAGE_REJECT_REASON,
        sourceDocumentIds: [2],
      })
    })

    it("本文候補を挿入した後、その文書の collected のうち挿入した本文候補に無いものを却下してから markFetched する", async () => {
      const content = buildMarkdown(["Alpha", "Beta"])
      const client = createFakeGitHubClient({
        contents: { "docs/a.md": content },
        trees: { [`${COMMIT_SHA}?recursive=1`]: { entries: [buildBlob("docs/a.md", "blob-a")] } },
      })
      const repo = createFakeRepo()
      const extracted = extractDocument({ content, fallbackTitle: "a", format: "markdown" })

      await collectGitHubSource(buildInput(), repo, createDeps(client))

      expect(repo.passageRepository.rejectCollected).toHaveBeenCalledWith({
        keepContentHashes: extracted.candidates.map((candidate) => candidate.contentHash),
        reason: SUPERSEDED_PASSAGE_REJECT_REASON,
        sourceDocumentIds: [100],
      })
      expect(repo.passageRepository.rejectCollected.mock.invocationCallOrder[0])
        .toBeLessThan(repo.sourceDocumentRepository.markFetched.mock.invocationCallOrder[0])
    })

    it("blob SHA が変わった・新しいファイルだけ本文を取り、変わっていない・対象外・.md / .mdx 以外・大きすぎるファイルは取らない", async () => {
      const client = createFakeGitHubClient({
        contents: { "docs/changed.md": buildMarkdown(["Alpha"]), "docs/new.mdx": buildMarkdown(["Beta"]) },
        trees: {
          [`${COMMIT_SHA}?recursive=1`]: {
            entries: [
              buildTree("docs", "tree-docs"),
              buildBlob("docs/unchanged.md", "blob-same"),
              buildBlob("docs/new.mdx", "blob-new"),
              buildBlob("docs/changed.md", "blob-changed-2"),
              buildBlob("docs/image.png", "blob-image"),
              buildBlob("docs/huge.md", "blob-huge", MAX_MARKDOWN_FILE_BYTES + 1),
              buildTree("docs/sub.md", "tree-sub"),
              buildBlob("other/outside.md", "blob-outside"),
            ],
          },
        },
      })
      const repo = createFakeRepo({
        documents: [
          buildSourceDocument({ id: 1, blobSha: "blob-same", extractionVersion: EXTRACTION_VERSION, path: "docs/unchanged.md" }),
          buildSourceDocument({ id: 2, blobSha: "blob-changed-1", extractionVersion: EXTRACTION_VERSION, path: "docs/changed.md" }),
        ],
      })

      const result = await collectGitHubSource(buildInput(), repo, createDeps(client))

      expect(client.getFileContent.mock.calls).toEqual([
        ["owner/repo", "docs/changed.md", COMMIT_SHA],
        ["owner/repo", "docs/new.mdx", COMMIT_SHA],
      ])
      expect(repo.sourceDocumentRepository.findBySourceId).toHaveBeenCalledWith(1)
      expect(result).toEqual({ createdPassageCount: 2, fetchedDocumentCount: 2, status: "completed" })
    })

    it("本文候補が sourceCommitSha / sourcePath / sourceRetrievedAt つきで挿入され、その後に markFetched が呼ばれる", async () => {
      const content = buildMarkdown(["Alpha", "Beta"])
      const client = createFakeGitHubClient({
        contents: { "docs/a.md": content },
        trees: { [`${COMMIT_SHA}?recursive=1`]: { entries: [buildBlob("docs/a.md", "blob-a")] } },
      })
      const repo = createFakeRepo()
      const extracted = extractDocument({ content, fallbackTitle: "a", format: "markdown" })

      await collectGitHubSource(buildInput(), repo, createDeps(client))

      expect(extracted.candidates).toHaveLength(2)
      expect(repo.sourceDocumentRepository.upsertByPath).toHaveBeenCalledWith({ path: "docs/a.md", sourceId: 1, title: "Doc" })
      expect(repo.passageRepository.insertIgnoringDuplicates).toHaveBeenCalledWith(
        extracted.candidates.map((candidate) => ({
          blocks: candidate.blocks,
          contentHash: candidate.contentHash,
          sourceCommitSha: COMMIT_SHA,
          sourceDocumentId: 100,
          sourcePath: "docs/a.md",
          sourceRetrievedAt: NOW,
          title: candidate.title,
          wordCount: candidate.wordCount,
        })),
      )
      expect(repo.sourceDocumentRepository.markFetched).toHaveBeenCalledWith(100, {
        blobSha: "blob-a",
        commitSha: COMMIT_SHA,
        contentHash: extracted.contentHash,
        etag: null,
        extractionVersion: EXTRACTION_VERSION,
        fetchedAt: NOW,
        httpStatus: null,
        lastModified: null,
        title: "Doc",
      })
      const [upsertOrder] = repo.sourceDocumentRepository.upsertByPath.mock.invocationCallOrder
      const [insertOrder] = repo.passageRepository.insertIgnoringDuplicates.mock.invocationCallOrder
      const [markFetchedOrder] = repo.sourceDocumentRepository.markFetched.mock.invocationCallOrder
      expect(upsertOrder).toBeLessThan(insertOrder)
      expect(insertOrder).toBeLessThan(markFetchedOrder)
    })

    it.each([
      ["未収集（null）", null],
      ["前回の SHA", "commit-sha-previous"],
    ])("全件処理すると completed で、収集を始めたときの SHA（%s）を条件に commit SHA と抽出の版を更新する", async (_label, previousSha) => {
      const client = createFakeGitHubClient(buildGitHubOptions(["docs/a.md", "docs/b.md"]))
      const repo = createFakeRepo()

      const result = await collectGitHubSource(
        buildInput({ source: buildGitHubSource({ lastCollectedCommitSha: previousSha }) }),
        repo,
        createDeps(client),
      )

      expect(result).toEqual({ createdPassageCount: 4, fetchedDocumentCount: 2, status: "completed" })
      expect(repo.contentSourceRepository.markCollected).toHaveBeenCalledWith(1, {
        lastCollectedAt: NOW,
        lastCollectedCommit: { expectedSha: previousSha, extractionVersion: EXTRACTION_VERSION, nextSha: COMMIT_SHA },
      })
      expect(warnMock).not.toHaveBeenCalled()
    })

    it("収集の途中で admin が last_collected_commit_sha を変えて markCollected が false を返したら、warn を出して completed で終える", async () => {
      const client = createFakeGitHubClient(buildGitHubOptions(["docs/a.md"]))
      const repo = createFakeRepo()
      repo.contentSourceRepository.markCollected.mockResolvedValue(false)

      const result = await collectGitHubSource(
        buildInput({ source: buildGitHubSource({ lastCollectedCommitSha: "commit-sha-previous" }) }),
        repo,
        createDeps(client),
      )

      expect(result.status).toBe("completed")
      expect(warnMock).toHaveBeenCalledWith(
        "last_collected_commit_sha was changed during the collection; the commit SHA is not recorded",
        { commitSha: COMMIT_SHA, expectedCommitSha: "commit-sha-previous", sourceId: 1 },
      )
    })

    it("maxDocuments に達すると limit_reached で、commit SHA を更新しない", async () => {
      const client = createFakeGitHubClient(buildGitHubOptions(["docs/a.md", "docs/b.md", "docs/c.md"]))
      const repo = createFakeRepo()

      const result = await collectGitHubSource(buildInput({ maxDocuments: 2 }), repo, createDeps(client))

      expect(result).toEqual({ createdPassageCount: 4, fetchedDocumentCount: 2, status: "limit_reached" })
      expect(client.getFileContent).toHaveBeenCalledTimes(2)
      expect(repo.contentSourceRepository.markCollected).toHaveBeenCalledWith(1, { lastCollectedAt: NOW })
    })

    it("maxPassages に達すると limit_reached で、1 文書の本文候補は途中で切らずに全部保存する", async () => {
      const client = createFakeGitHubClient(buildGitHubOptions(["docs/a.md", "docs/b.md"]))
      const repo = createFakeRepo()

      const result = await collectGitHubSource(buildInput({ maxPassages: 1 }), repo, createDeps(client))

      expect(result).toEqual({ createdPassageCount: 2, fetchedDocumentCount: 1, status: "limit_reached" })
      expect(repo.passageRepository.insertIgnoringDuplicates).toHaveBeenCalledTimes(1)
      expect(repo.passageRepository.insertIgnoringDuplicates.mock.calls[0][0]).toHaveLength(2)
      expect(repo.contentSourceRepository.markCollected).toHaveBeenCalledWith(1, { lastCollectedAt: NOW })
    })

    it("rate limit の残りが閾値を切ると、取得済みの文書を保存して rate_limited で終え、commit SHA を更新しない", async () => {
      /**
       * 103 → commits で 102 → tree で 101 → a.md で 100 → b.md で 99（ここで打ち切り）
       */
      const client = createFakeGitHubClient(buildGitHubOptions(
        ["docs/a.md", "docs/b.md", "docs/c.md"],
        { rateLimitRemaining: 103 },
      ))
      const repo = createFakeRepo()

      const result = await collectGitHubSource(buildInput(), repo, createDeps(client))

      expect(result).toEqual({ createdPassageCount: 4, fetchedDocumentCount: 2, status: "rate_limited" })
      expect(repo.sourceDocumentRepository.markFetched).toHaveBeenCalledTimes(2)
      expect(repo.contentSourceRepository.markCollected).toHaveBeenCalledWith(1, { lastCollectedAt: NOW })
    })

    it("ツリーが切り詰められ glob の base が空（ルート）なら、取れた分を処理して commit SHA を更新しない", async () => {
      const client = createFakeGitHubClient({
        contents: { "docs/a.md": buildMarkdown(["Alpha"]) },
        trees: { [`${COMMIT_SHA}?recursive=1`]: { entries: [buildBlob("docs/a.md", "blob-a")], isTruncated: true } },
      })
      const repo = createFakeRepo()

      const result = await collectGitHubSource(
        buildInput({ source: buildGitHubSource({ includeGlobs: ["**/*.md"] }) }),
        repo,
        createDeps(client),
      )

      expect(result).toEqual({ createdPassageCount: 1, fetchedDocumentCount: 1, status: "limit_reached" })
      expect(repo.contentSourceRepository.markCollected).toHaveBeenCalledWith(1, { lastCollectedAt: NOW })
    })

    it("extractDocument が throw する文書は本文候補の挿入も却下もせず、抽出の版を記録して markFetched され、次の文書へ進む", async () => {
      const client = createFakeGitHubClient({
        contents: { "docs/a-broken.mdx": BROKEN_MDX, "docs/b.md": buildMarkdown(["Alpha"]) },
        trees: {
          [`${COMMIT_SHA}?recursive=1`]: {
            entries: [buildBlob("docs/a-broken.mdx", "blob-broken"), buildBlob("docs/b.md", "blob-b")],
          },
        },
      })
      const repo = createFakeRepo()

      const result = await collectGitHubSource(buildInput(), repo, createDeps(client))

      expect(result).toEqual({ createdPassageCount: 1, fetchedDocumentCount: 2, status: "completed" })
      expect(repo.sourceDocumentRepository.upsertByPath).toHaveBeenNthCalledWith(1, {
        path: "docs/a-broken.mdx",
        sourceId: 1,
        title: null,
      })
      expect(repo.passageRepository.insertIgnoringDuplicates).toHaveBeenCalledTimes(1)
      expect(repo.passageRepository.rejectCollected).toHaveBeenCalledTimes(1)
      expect(repo.passageRepository.rejectCollected).toHaveBeenCalledWith(expect.objectContaining({ sourceDocumentIds: [101] }))
      expect(repo.sourceDocumentRepository.markFetched).toHaveBeenNthCalledWith(1, 100, expect.objectContaining({
        blobSha: "blob-broken",
        contentHash: null,
        extractionVersion: EXTRACTION_VERSION,
        title: null,
      }))
      expect(repo.sourceDocumentRepository.markFetched).toHaveBeenNthCalledWith(2, 101, expect.objectContaining({
        blobSha: "blob-b",
      }))
    })

    it("2 回目の実行（findBySourceId が今回の blob SHA と抽出の版を返す）では本文を取らない（冪等）", async () => {
      const paths = ["docs/a.md", "docs/b.md"]
      const client = createFakeGitHubClient(buildGitHubOptions(paths))
      const repo = createFakeRepo({
        documents: paths.map((path, index) =>
          buildSourceDocument({ id: index + 1, blobSha: `blob-${path}`, extractionVersion: EXTRACTION_VERSION, path })),
      })

      const result = await collectGitHubSource(buildInput(), repo, createDeps(client))

      expect(result).toEqual({ createdPassageCount: 0, fetchedDocumentCount: 0, status: "completed" })
      expect(client.getFileContent).not.toHaveBeenCalled()
      expect(repo.passageRepository.insertIgnoringDuplicates).not.toHaveBeenCalled()
      expect(repo.sourceDocumentRepository.markFetched).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("本文の取得で rate limit を使い切ったら throw し、markCollected しない", async () => {
      const client = createFakeGitHubClient(buildGitHubOptions(["docs/a.md"]))
      client.getFileContent.mockRejectedValueOnce(new GitHubRateLimitError("/repos/owner/repo/contents/docs/a.md"))
      const repo = createFakeRepo()

      await expect(collectGitHubSource(buildInput(), repo, createDeps(client))).rejects.toBeInstanceOf(GitHubRateLimitError)
      expect(repo.contentSourceRepository.markCollected).not.toHaveBeenCalled()
    })

    it("Repository が throw したらそのまま伝搬する（blob SHA は記録されない）", async () => {
      const client = createFakeGitHubClient(buildGitHubOptions(["docs/a.md"]))
      const repo = createFakeRepo()
      repo.passageRepository.insertIgnoringDuplicates.mockRejectedValueOnce(new Error("db connection failed"))

      await expect(collectGitHubSource(buildInput(), repo, createDeps(client))).rejects.toThrow("db connection failed")
      expect(repo.sourceDocumentRepository.markFetched).not.toHaveBeenCalled()
    })
  })
})
