import { buildAttribution } from "../../src/lib/build-attribution"
import type { PassageSource } from "../../src/repository"

const RETRIEVED_AT = new Date("2026-10-10T03:00:00.000Z")
const COMMIT_SHA = "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b"

const buildGitHubSource = (overrides: Partial<Extract<PassageSource, { fetchType: "github_repository" }>> = {}): PassageSource => ({
  branch: "main",
  fetchType: "github_repository",
  kind: "docs",
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
  name: "React 公式ドキュメント",
  publicUrlStripPrefix: "src/content/",
  publicUrlTemplate: "https://react.dev/{path}",
  repository: "reactjs/react.dev",
  tags: ["react"],
  ...overrides,
})

describe("buildAttribution", () => {
  describe("正常系", () => {
    it("GitHub で URL 規則があれば、プレフィックスと拡張子を外して公開ページの URL を作り、コミットに固定したリンクを付ける", () => {
      const attribution = buildAttribution(buildGitHubSource(), {
        sourceCommitSha: COMMIT_SHA,
        sourcePath: "src/content/learn/synchronizing-with-effects.md",
        sourceRetrievedAt: RETRIEVED_AT,
      })

      expect(attribution).toEqual({
        commitSha: COMMIT_SHA,
        licenseSpdx: "CC-BY-4.0",
        licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
        pageUrl: "https://react.dev/learn/synchronizing-with-effects",
        permalinkUrl: `https://github.com/reactjs/react.dev/blob/${COMMIT_SHA}/src/content/learn/synchronizing-with-effects.md`,
        retrievedAt: RETRIEVED_AT,
        sourceKind: "docs",
        sourceName: "React 公式ドキュメント",
      })
    })

    it.each([
      ["拡張子 .mdx を外す", "src/content/reference/react/useEffect.mdx", "src/content/", "https://react.dev/reference/react/useEffect"],
      ["プレフィックスが無ければ拡張子だけ外す", "docs/intro.md", null, "https://react.dev/docs/intro"],
      ["プレフィックスで始まらないパスはそのまま使う", "blog/2024/post.md", "src/content/", "https://react.dev/blog/2024/post"],
    ])("GitHub で URL 規則があれば%s", (_label, sourcePath, stripPrefix, expected) => {
      const attribution = buildAttribution(buildGitHubSource({ publicUrlStripPrefix: stripPrefix }), {
        sourceCommitSha: COMMIT_SHA,
        sourcePath,
        sourceRetrievedAt: RETRIEVED_AT,
      })

      expect(attribution.pageUrl).toBe(expected)
    })

    it("GitHub で URL 規則が無ければ、ブランチの GitHub のファイルを公開ページの URL にする", () => {
      const attribution = buildAttribution(
        buildGitHubSource({ kind: "github", publicUrlStripPrefix: null, publicUrlTemplate: null, repository: "rust-lang/rfcs" }),
        { sourceCommitSha: COMMIT_SHA, sourcePath: "text/2094-nll.md", sourceRetrievedAt: RETRIEVED_AT },
      )

      expect(attribution).toMatchObject({
        pageUrl: "https://github.com/rust-lang/rfcs/blob/main/text/2094-nll.md",
        permalinkUrl: `https://github.com/rust-lang/rfcs/blob/${COMMIT_SHA}/text/2094-nll.md`,
        sourceKind: "github",
      })
    })

    it("GitHub でコミットが無ければ permalink は null", () => {
      const attribution = buildAttribution(buildGitHubSource(), {
        sourceCommitSha: null,
        sourcePath: "src/content/learn/synchronizing-with-effects.md",
        sourceRetrievedAt: RETRIEVED_AT,
      })

      expect(attribution).toMatchObject({
        commitSha: null,
        pageUrl: "https://react.dev/learn/synchronizing-with-effects",
        permalinkUrl: null,
      })
    })

    it("サイトはサイトの URL とパスからページの URL を作り、permalink は null", () => {
      const attribution = buildAttribution(
        {
          fetchType: "website",
          kind: "docs",
          licenseSpdx: "BSD-3-Clause",
          licenseUrl: "https://go.dev/LICENSE",
          name: "Go 公式ドキュメント",
          siteUrl: "https://go.dev",
          tags: ["go"],
        },
        { sourceCommitSha: null, sourcePath: "/doc/effective_go", sourceRetrievedAt: RETRIEVED_AT },
      )

      expect(attribution).toEqual({
        commitSha: null,
        licenseSpdx: "BSD-3-Clause",
        licenseUrl: "https://go.dev/LICENSE",
        pageUrl: "https://go.dev/doc/effective_go",
        permalinkUrl: null,
        retrievedAt: RETRIEVED_AT,
        sourceKind: "docs",
        sourceName: "Go 公式ドキュメント",
      })
    })
  })
})
