import { findGlobBaseDirectories, isTargetPath } from "../src/path-filter"

describe("isTargetPath", () => {
  describe("正常系", () => {
    const filter = {
      excludeGlobs: ["src/content/learn/legacy/**"],
      includeGlobs: ["src/content/learn/**/*.md", "README.md"],
    }

    it.each([
      ["対象パスに合う", "src/content/learn/state.md", true],
      ["入れ子のディレクトリも対象パスに合う", "src/content/learn/hooks/use-state.md", true],
      ["glob 文字の無い対象パスに合う", "README.md", true],
      ["除外パスに合う", "src/content/learn/legacy/old.md", false],
      ["対象パスに合わない", "src/content/reference/react.md", false],
      ["拡張子が違う", "src/content/learn/state.mdx", false],
    ])("%s → %s", (_label, targetPath, expected) => {
      expect(isTargetPath(targetPath, filter)).toBe(expected)
    })

    it("除外パスが空なら対象パスだけで判定する", () => {
      expect(isTargetPath("docs/a.md", { excludeGlobs: [], includeGlobs: ["docs/**"] })).toBe(true)
    })

    it("サイトの URL のパス（先頭が /）にも使える", () => {
      const siteFilter = { excludeGlobs: ["/doc/devel/**"], includeGlobs: ["/doc/**"] }
      expect(isTargetPath("/doc/tutorial/getting-started", siteFilter)).toBe(true)
      expect(isTargetPath("/doc/devel/release", siteFilter)).toBe(false)
    })
  })

  describe("異常系", () => {
    it("対象パスが空なら何も対象にしない", () => {
      expect(isTargetPath("docs/a.md", { excludeGlobs: [], includeGlobs: [] })).toBe(false)
    })
  })
})

describe("findGlobBaseDirectories", () => {
  describe("正常系", () => {
    it("入れ子のディレクトリは外側だけを残す", () => {
      expect(findGlobBaseDirectories(["src/content/learn/**/*.md", "src/content/**/*.md"])).toEqual(["src/content"])
    })

    it("入れ子でないディレクトリはそれぞれ昇順で残す（名前の前方一致は入れ子とみなさない）", () => {
      expect(findGlobBaseDirectories(["text/**/*.md", "docs/**", "docs-old/*.md", "docs/guide/*.md"])).toEqual([
        "docs",
        "docs-old",
        "text",
      ])
    })

    it("glob 文字の無いファイルパスは、そのファイルがあるディレクトリにする", () => {
      expect(findGlobBaseDirectories(["src/content/learn/escape-hatches.md"])).toEqual(["src/content/learn"])
    })

    it.each([
      ["** で始まる glob", ["**/*.md", "docs/**"]],
      ["ルートのファイル", ["README.md", "docs/**"]],
    ])("%s があれば [\"\"]（ルート）を返す", (_label, globs) => {
      expect(findGlobBaseDirectories(globs)).toEqual([""])
    })
  })
})
