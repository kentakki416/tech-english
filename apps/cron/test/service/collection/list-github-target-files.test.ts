import { listGitHubTargetFiles } from "../../../src/service/collection"

import { buildBlob, buildGitHubSource, buildTree, COMMIT_SHA, createFakeGitHubClient } from "./helpers"

/**
 * 再帰のツリーが切り詰められるコミット。ルート → src までは非再帰でたどれる
 */
const TRUNCATED_ROOT = {
  [COMMIT_SHA]: {
    entries: [buildTree("src", "tree-src"), buildTree("text", "tree-text"), buildBlob("README.md", "blob-readme")],
  },
  [`${COMMIT_SHA}?recursive=1`]: { entries: [buildBlob("src/content/partial.md", "blob-partial")], isTruncated: true },
  "tree-src": { entries: [buildTree("content", "tree-content"), buildTree("assets", "tree-assets")] },
}

describe("listGitHubTargetFiles", () => {
  describe("正常系", () => {
    it("切り詰められていなければ、再帰のツリー 1 回で対象のファイルを path の昇順で返す", async () => {
      const client = createFakeGitHubClient({
        trees: {
          [`${COMMIT_SHA}?recursive=1`]: {
            entries: [buildBlob("docs/b.md", "blob-b"), buildTree("docs", "tree-docs"), buildBlob("docs/a.MD", "blob-a")],
          },
        },
      })

      const result = await listGitHubTargetFiles(
        { commitSha: COMMIT_SHA, source: buildGitHubSource() },
        { githubContentClient: client },
      )

      expect(result).toEqual({ files: [buildBlob("docs/a.MD", "blob-a"), buildBlob("docs/b.md", "blob-b")], isComplete: true })
      expect(client.getTree).toHaveBeenCalledTimes(1)
    })

    it("truncated のツリーでは、glob の base ごとにサブツリーを取り直してパスを前置する", async () => {
      const client = createFakeGitHubClient({
        trees: {
          ...TRUNCATED_ROOT,
          "tree-content?recursive=1": {
            entries: [
              buildTree("learn", "tree-learn"),
              buildBlob("learn/state.md", "blob-state"),
              buildBlob("b.md", "blob-b"),
              buildBlob("learn/diagram.png", "blob-png"),
            ],
          },
          "tree-text?recursive=1": {
            entries: [buildBlob("0001-intro.md", "blob-0001"), buildBlob("nested/skip.md", "blob-skip")],
          },
        },
      })
      const source = buildGitHubSource({ includeGlobs: ["src/content/learn/**/*.md", "src/content/**/*.md", "text/*.md"] })

      const result = await listGitHubTargetFiles({ commitSha: COMMIT_SHA, source }, { githubContentClient: client })

      expect(result).toEqual({
        files: [
          buildBlob("src/content/b.md", "blob-b"),
          buildBlob("src/content/learn/state.md", "blob-state"),
          buildBlob("text/0001-intro.md", "blob-0001"),
        ],
        isComplete: true,
      })
      expect(client.getTree.mock.calls.map(([, sha, options]) => [sha, options.isRecursive])).toEqual([
        [COMMIT_SHA, true],
        [COMMIT_SHA, false],
        ["tree-src", false],
        ["tree-content", true],
        [COMMIT_SHA, false],
        ["tree-text", true],
      ])
    })

    it("取り直したサブツリーも切り詰められていたら isComplete: false", async () => {
      const client = createFakeGitHubClient({
        trees: {
          ...TRUNCATED_ROOT,
          "tree-content?recursive=1": { entries: [buildBlob("a.md", "blob-a")], isTruncated: true },
        },
      })
      const source = buildGitHubSource({ includeGlobs: ["src/content/**/*.md"] })

      const result = await listGitHubTargetFiles({ commitSha: COMMIT_SHA, source }, { githubContentClient: client })

      expect(result).toEqual({ files: [buildBlob("src/content/a.md", "blob-a")], isComplete: false })
    })

    it("base のディレクトリがコミットに無ければ、そのディレクトリのファイルは無いものとして扱う", async () => {
      const client = createFakeGitHubClient({ trees: TRUNCATED_ROOT })
      const source = buildGitHubSource({ includeGlobs: ["docs/**/*.md"] })

      const result = await listGitHubTargetFiles({ commitSha: COMMIT_SHA, source }, { githubContentClient: client })

      expect(result).toEqual({ files: [], isComplete: true })
    })

    it("base が空（ルート）なら取り直さず、切り詰められた結果を isComplete: false で返す", async () => {
      const client = createFakeGitHubClient({ trees: TRUNCATED_ROOT })
      const source = buildGitHubSource({ includeGlobs: ["**/*.md"] })

      const result = await listGitHubTargetFiles({ commitSha: COMMIT_SHA, source }, { githubContentClient: client })

      expect(result).toEqual({ files: [buildBlob("src/content/partial.md", "blob-partial")], isComplete: false })
      expect(client.getTree).toHaveBeenCalledTimes(1)
    })
  })
})
