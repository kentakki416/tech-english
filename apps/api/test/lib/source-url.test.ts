import { buildGitHubIncludeGlob, buildWebsiteIncludeGlob, parseSourceUrl, splitBranchAndPath } from "../../src/lib/source-url"

describe("parseSourceUrl", () => {
  describe("正常系", () => {
    it.each([
      ["リポジトリのトップ", "https://github.com/rust-lang/book", { refAndPath: [], repository: "rust-lang/book", target: "root" }],
      ["末尾の / と .git", "https://github.com/rust-lang/book.git/", { refAndPath: [], repository: "rust-lang/book", target: "root" }],
      ["大文字と www と http", "http://www.github.com/ReactJS/React.dev", { refAndPath: [], repository: "reactjs/react.dev", target: "root" }],
      [
        "ディレクトリ",
        "https://github.com/reactjs/react.dev/tree/main/src/content/learn",
        { refAndPath: ["main", "src", "content", "learn"], repository: "reactjs/react.dev", target: "directory" },
      ],
      [
        "ファイル",
        "https://github.com/rust-lang/rfcs/blob/master/README.md",
        { refAndPath: ["master", "README.md"], repository: "rust-lang/rfcs", target: "file" },
      ],
      [
        "? と # は見ない",
        "https://github.com/rust-lang/book/tree/main/src?tab=readme#top",
        { refAndPath: ["main", "src"], repository: "rust-lang/book", target: "directory" },
      ],
      [
        "パスの % エンコードは戻す",
        "https://github.com/owner/repo/tree/main/docs/getting%20started",
        { refAndPath: ["main", "docs", "getting started"], repository: "owner/repo", target: "directory" },
      ],
      ["tree / blob 以外はトップ", "https://github.com/rust-lang/book/issues/1", { refAndPath: [], repository: "rust-lang/book", target: "root" }],
      ["tree だけはトップ", "https://github.com/rust-lang/book/tree", { refAndPath: [], repository: "rust-lang/book", target: "root" }],
    ])("GitHub の %s", (_label, url, expected) => {
      expect(parseSourceUrl(url)).toEqual({ fetchType: "github_repository", ...expected })
    })

    it.each([
      ["トップ", "https://go.dev", { path: "/", siteUrl: "https://go.dev" }],
      ["パス付き", "https://go.dev/doc/", { path: "/doc/", siteUrl: "https://go.dev" }],
      ["http は https にする", "http://docs.python.org/3/tutorial/", { path: "/3/tutorial/", siteUrl: "https://docs.python.org" }],
      ["github.com のサブドメインはサイト", "https://docs.github.com/en/get-started", { path: "/en/get-started", siteUrl: "https://docs.github.com" }],
    ])("サイトの %s", (_label, url, expected) => {
      expect(parseSourceUrl(url)).toEqual({ fetchType: "website", ...expected })
    })
  })

  describe("異常系", () => {
    it.each([
      ["owner だけ", "https://github.com/reactjs"],
      ["GitHub のトップ", "https://github.com/"],
      ["owner の形が違う", "https://github.com/-bad-/repo"],
      ["name が .git だけ", "https://github.com/owner/.git"],
    ])("%s なら null", (_label, url) => {
      expect(parseSourceUrl(url)).toBeNull()
    })
  })
})

describe("splitBranchAndPath", () => {
  describe("正常系", () => {
    it.each([
      ["空ならブランチは default branch", [], "main", { branch: "main", path: "" }],
      ["default branch で始まる", ["main", "src", "content"], "main", { branch: "main", path: "src/content" }],
      ["/ を含む default branch", ["release", "v2", "docs"], "release/v2", { branch: "release/v2", path: "docs" }],
      ["default branch でなければ最初の区切りまで", ["release", "v2", "docs"], "main", { branch: "release", path: "v2/docs" }],
      ["default branch の一部だけが一致するなら最初の区切りまで", ["release", "docs"], "release/v2", { branch: "release", path: "docs" }],
      ["ブランチだけ", ["main"], "main", { branch: "main", path: "" }],
    ])("%s", (_label, refAndPath, defaultBranch, expected) => {
      expect(splitBranchAndPath(refAndPath, defaultBranch)).toEqual(expected)
    })
  })
})

describe("buildGitHubIncludeGlob", () => {
  describe("正常系", () => {
    it.each([
      ["root", "", "**"],
      ["directory", "src/content/learn", "src/content/learn/**"],
      ["file", "README.md", "README.md"],
      ["file", "", "**"],
      ["directory", "", "**"],
    ] as const)("%s（%s）は %s", (target, path, expected) => {
      expect(buildGitHubIncludeGlob(target, path)).toBe(expected)
    })
  })
})

describe("buildWebsiteIncludeGlob", () => {
  describe("正常系", () => {
    it.each([
      ["/", "/**"],
      ["/doc/", "/doc/**"],
      ["/doc", "/doc/**"],
      ["/doc//", "/doc/**"],
    ])("%s は %s", (path, expected) => {
      expect(buildWebsiteIncludeGlob(path)).toBe(expected)
    })
  })
})
