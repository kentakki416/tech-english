import { isTargetPath } from "@repo/content-extractor"

import {
  buildDefaultExcludeGlobs,
  findDocumentsDirectory,
  findParentDirectory,
  isInsideDirectory,
  listDirectoryAndAncestors,
} from "../../src/lib/source-document-path"

const buildPaths = (directory: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${directory}/page-${index}.md`)

const isKept = (filePath: string, documentsPath: string, options = { hasReadmePages: false }): boolean =>
  isTargetPath(filePath, {
    excludeGlobs: buildDefaultExcludeGlobs(documentsPath, options),
    includeGlobs: [documentsPath === "" ? "**" : `${documentsPath}/**`],
  })

describe("findDocumentsDirectory", () => {
  describe("正常系", () => {
    it.each([
      ["トップの docs（ほかの Markdown のほうが多くても選ぶ）", [...buildPaths("docs", 20), ...buildPaths("packages/next", 900)], "docs"],
      ["docs より doc を後に見る", [...buildPaths("doc", 30), ...buildPaths("docs", 20)], "docs"],
      ["集まっているディレクトリに降りる（react.dev）", [...buildPaths("src/content/learn", 10), ...buildPaths("src/content/reference", 10), "README.md"], "src/content"],
      ["アンダースコアのディレクトリに降りる（golang/website）", [...buildPaths("_content/doc", 10), ...buildPaths("_content/blog", 10)], "_content"],
      ["言語が並ぶ階層では en に降りる（kubernetes/website）", [...buildPaths("content/en/docs", 30), ...buildPaths("content/en/blog", 30), ...buildPaths("content/ja/docs", 30), ...buildPaths("content/zh-cn/docs", 30)], "content/en"],
      ["en が無ければ言語の親に留まる（ClickHouse）", [...buildPaths("docs/ja", 30), ...buildPaths("docs/ko", 30), ...buildPaths("docs/guides", 30)], "docs"],
      ["docs の中の source に降りる（PyTorch）", [...buildPaths("docs/source/a", 30), "docs/README.md"], "docs/source"],
      ["docs の中の製品の分類には降りない（docker/docs）", [...buildPaths("content/manuals/a", 80), ...buildPaths("content/guides", 20)], "content"],
      ["依存物とテストを数えない", [...buildPaths("deps/v8", 500), ...buildPaths("test/fixtures", 500), ...buildPaths("guide", 30)], "guide"],
      ["ドット始まりのディレクトリを数えない", [...buildPaths(".claude/skills", 500), ...buildPaths("guide", 30)], "guide"],
      ["どこにも集まっていなければルート（denoland/docs）", [...buildPaths("runtime", 30), ...buildPaths("deploy", 30), ...buildPaths("examples", 30)], ""],
    ])("%s", (_label, paths, expected) => {
      expect(findDocumentsDirectory(paths)).toBe(expected)
    })

    it("Markdown が無ければルート", () => {
      expect(findDocumentsDirectory([])).toBe("")
    })

    it("docs が 20 件ならドキュメントとして選び、19 件なら選ばない", () => {
      expect(findDocumentsDirectory([...buildPaths("docs", 20), ...buildPaths("a", 30), ...buildPaths("b", 30)])).toBe("docs")
      expect(findDocumentsDirectory([...buildPaths("docs", 19), ...buildPaths("a", 30), ...buildPaths("b", 30)])).toBe("")
    })

    it("1 つのディレクトリに 70% ちょうど集まれば降り、それ未満なら降りない", () => {
      expect(findDocumentsDirectory([...buildPaths("guide", 7), ...buildPaths("other", 3)])).toBe("guide")
      expect(findDocumentsDirectory([...buildPaths("guide", 69), ...buildPaths("other", 31)])).toBe("")
    })
  })
})

describe("buildDefaultExcludeGlobs", () => {
  describe("正常系", () => {
    it.each([
      ["翻訳", "docs/ja/guide.md"],
      ["ハイフンつきの言語", "docs/pt-BR/guide.md"],
      ["CHANGELOG", "docs/guide/CHANGELOG.md"],
      ["小文字の変更履歴", "docs/resources/changelog.mdx"],
      ["変更履歴のディレクトリ", "docs/resources/changelogs/cloud/2024.mdx"],
      ["ハイフンつきの変更履歴のディレクトリ", "docs/ddos-protection/change-log/http/2023.mdx"],
      ["リリースノート", "docs/manuals/compose/release-notes.md"],
      ["接頭辞つきのリリースノート", "docs/manuals/build/dockerfile-release-notes.md"],
      ["リリースノートのディレクトリ", "docs/develop/release-notes/v2.14.0.md"],
      ["what's new", "docs/whatsnew/whats-new-in-v10/index.md"],
      ["ブログ", "docs/blog/2024/announcing.md"],
      ["README", "docs/README.md"],
      ["小文字の README", "docs/examples/readme.md"],
      ["AGENTS.md", "docs/AGENTS.md"],
      ["CONTRIBUTING.md", "docs/guide/CONTRIBUTING.md"],
      ["貢献の手順", "docs/contribute/style/style-guide.md"],
      ["アンダースコアのディレクトリ", "docs/_snippets/explanation.md"],
      ["入れ子のアンダースコアのディレクトリ", "docs/reference/_includes/content/changelog.md"],
      ["ページの部品", "docs/includes/compose/build.md"],
      ["3 要素の版", "docs/operate/1.2.3/index.md"],
      ["古い版", "docs/operate/rs/7.22/clusters/index.md"],
      ["v つきの古い版", "docs/atlas-cli/v1.55/overview.md"],
      ["過去の版のディレクトリ", "docs/manuals/desktop/previous-versions/3.x-mac.md"],
      ["Docusaurus の版", "docs/versioned_docs/version-2.0/intro.md"],
    ])("%s を除外する", (_label, filePath) => {
      expect(isKept(filePath, "docs")).toBe(false)
    })

    it.each([
      ["ふつうのページ", "docs/guide/getting-started.md"],
      ["Hugo のセクションのページ", "docs/concepts/_index.md"],
      ["components のページ", "docs/reference/react-dom/components/input.md"],
      ["examples のページ", "docs/operate/api/examples/create-database.md"],
      ["security のページ", "docs/guide/security.md"],
      ["agents のページ", "docs/ai/agents.mdx"],
      ["リリースの説明", "docs/reference/releases.md"],
      ["数字で始まるページ", "docs/1.getting-started/10.data-fetching.md"],
      ["移行ガイド", "docs/guides/migrating/from-vite.mdx"],
      ["深い階層の言語と同じ名前のページ", "docs/web/html/attributes/id/index.md"],
      ["版に見える 4 要素の製品名（Cloudflare の 1.1.1.1）", "docs/1.1.1.1/setup.mdx"],
      ["snippets という製品のページ", "docs/rules/snippets/how-it-works.mdx"],
    ])("%s は残す", (_label, filePath) => {
      expect(isKept(filePath, "docs")).toBe(true)
    })

    it("対象パスがアンダースコアで始まっても、対象パスの中のページは残す", () => {
      expect(isKept("_content/doc/tutorial/getting-started.md", "_content")).toBe(true)
    })

    it("hasReadmePages なら README を残す", () => {
      expect(isKept("docs/tutorials/steps/1/README.md", "docs", { hasReadmePages: true })).toBe(true)
    })

    it("ルートのときは頭に何も付けない", () => {
      expect(isKept("ja/guide.md", "")).toBe(false)
      expect(isKept("runtime/manual.md", "")).toBe(true)
    })

    it("深いディレクトリでも glob は api の上限（500 文字・50 個）に収まる", () => {
      const globs = buildDefaultExcludeGlobs("a".repeat(300), { hasReadmePages: false })

      expect(Math.max(...globs.map((glob) => glob.length))).toBeLessThanOrEqual(500)
      expect(globs.length).toBeLessThanOrEqual(50)
    })
  })
})

describe("listDirectoryAndAncestors", () => {
  describe("正常系", () => {
    it.each([
      ["", []],
      ["docs", ["docs"]],
      ["docs/reference/api", ["docs", "docs/reference", "docs/reference/api"]],
    ])("%s", (directory, expected) => {
      expect(listDirectoryAndAncestors(directory)).toEqual(expected)
    })
  })
})

describe("findParentDirectory", () => {
  describe("正常系", () => {
    it.each([
      ["docs/guide/a.md", "docs/guide"],
      ["a.md", ""],
    ])("%s", (filePath, expected) => {
      expect(findParentDirectory(filePath)).toBe(expected)
    })
  })
})

describe("isInsideDirectory", () => {
  describe("正常系", () => {
    it.each([
      ["src/guide", "src", true],
      ["src", "src", true],
      ["src-old/guide", "src", false],
      ["anything", "", true],
    ])("%s は %s の中か", (targetPath, directory, expected) => {
      expect(isInsideDirectory(targetPath, directory)).toBe(expected)
    })
  })
})
