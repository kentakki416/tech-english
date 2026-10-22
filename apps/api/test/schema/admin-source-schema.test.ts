import {
  createSourceRequestSchema,
  detectSourceLicenseQueryStringSchema,
  passageCountsSchema,
  updateSourceRequestSchema,
} from "@repo/api-schema"

/**
 * admin のソース API のスキーマ（@repo/api-schema）のうち、値を変換するものを確かめる。
 * DB・Redis に接続しないよう、controller のテストの fixtures（setup を読む）は使わない
 */
const GITHUB_REQUEST = {
  branch: "main",
  exclude_globs: [],
  fetch_type: "github_repository",
  include_globs: ["src/content/learn/**/*.md"],
  is_enabled: true,
  kind: "docs",
  license_spdx: "CC-BY-4.0",
  license_url: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
  name: "React 公式ドキュメント",
  public_url_strip_prefix: null,
  public_url_template: null,
  repository: "reactjs/react.dev",
  tag_ids: [],
}

const WEBSITE_REQUEST = {
  content_selector: null,
  exclude_globs: [],
  exclude_selectors: [],
  fetch_type: "website",
  include_globs: ["/doc/**"],
  kind: "docs",
  license_spdx: "CC-BY-4.0",
  license_url: "https://go.dev/copyright",
  name: "Go 公式ドキュメント",
  site_url: "https://go.dev",
  tag_ids: [],
}

/**
 * 1〜count の連番
 */
const buildSequence = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1)

describe("admin source schema", () => {
  describe("正常系", () => {
    it.each([
      ["登録", createSourceRequestSchema],
      ["更新", updateSourceRequestSchema],
    ])("%sのリクエストの repository を小文字にそろえる", (_label, schema) => {
      const parsed = schema.parse({ ...GITHUB_REQUEST, repository: "ReactJS/React.dev" })

      expect(parsed).toMatchObject({ repository: "reactjs/react.dev" })
    })

    it.each([
      ["空", []],
      ["2 個", [1, 2]],
      ["10 個（境界値）", buildSequence(10)],
      ["DB の integer の上限ちょうど（境界値）", [2147483647]],
    ])("登録・更新のリクエストの tag_ids は%sなら通る", (_label, tagIds) => {
      expect(createSourceRequestSchema.parse({ ...GITHUB_REQUEST, tag_ids: tagIds })).toMatchObject({ tag_ids: tagIds })
      expect(updateSourceRequestSchema.parse({ ...GITHUB_REQUEST, tag_ids: tagIds })).toMatchObject({ tag_ids: tagIds })
    })

    it.each([
      ["ライセンスのファイル", "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md"],
      ["大文字・小文字だけが違う owner / name", "https://github.com/ReactJS/React.dev/blob/main/LICENSE-DOCS.md"],
      ["タグを指す", "https://github.com/reactjs/react.dev/blob/v19.0.0/README.md"],
      ["/ を含むブランチ", "https://github.com/reactjs/react.dev/blob/feature/docs/LICENSE"],
    ])("github の license_url が%sの URL なら通る", (_label, licenseUrl) => {
      expect(createSourceRequestSchema.safeParse({ ...GITHUB_REQUEST, license_url: licenseUrl }).success).toBe(true)
      expect(updateSourceRequestSchema.safeParse({ ...GITHUB_REQUEST, license_url: licenseUrl }).success).toBe(true)
    })

    it("website は license_spdx に LicenseRef-personal-use を選べる", () => {
      expect(createSourceRequestSchema.safeParse({ ...WEBSITE_REQUEST, license_spdx: "LicenseRef-personal-use" }).success).toBe(true)
    })

    it.each([
      ["登録", createSourceRequestSchema],
      ["更新", updateSourceRequestSchema],
    ])("%sのリクエストの website の is_enabled は捨てる", (_label, schema) => {
      const parsed = schema.parse({ ...WEBSITE_REQUEST, is_enabled: true })

      expect(parsed).not.toHaveProperty("is_enabled")
    })

    it("検出ライセンス取得のクエリの repository を小文字にそろえる", () => {
      expect(detectSourceLicenseQueryStringSchema.parse({ repository: "Rust-Lang/Book" })).toEqual({ repository: "rust-lang/book" })
    })

    it("passageCountsSchema は本文候補のすべての状態をキーに持つ", () => {
      const counts = { collected: 1, draft: 2, failed: 3, generating: 4, published: 5, rejected: 6 }

      expect(passageCountsSchema.parse(counts)).toEqual(counts)
    })
  })

  describe("異常系", () => {
    it("passageCountsSchema は状態のキーが欠けていると失敗する", () => {
      expect(passageCountsSchema.safeParse({ collected: 1, draft: 2, failed: 3, generating: 4, published: 5 }).success).toBe(false)
    })

    it.each([
      ["重複がある", { ...GITHUB_REQUEST, tag_ids: [1, 1] }],
      ["11 個（境界値）", { ...GITHUB_REQUEST, tag_ids: buildSequence(11) }],
      ["0", { ...GITHUB_REQUEST, tag_ids: [0] }],
      ["負の数", { ...GITHUB_REQUEST, tag_ids: [-1] }],
      ["小数", { ...GITHUB_REQUEST, tag_ids: [1.5] }],
      ["文字列", { ...GITHUB_REQUEST, tag_ids: ["1"] }],
      ["DB の integer の上限を超える", { ...GITHUB_REQUEST, tag_ids: [2147483648] }],
      ["省略（古い形の tags だけ）", { ...GITHUB_REQUEST, tag_ids: undefined, tags: ["react"] }],
    ])("登録・更新のリクエストの tag_ids が%sなら失敗する", (_label, body) => {
      expect(createSourceRequestSchema.safeParse(body).success).toBe(false)
      expect(updateSourceRequestSchema.safeParse(body).success).toBe(false)
    })

    it.each([
      ["リポジトリの外のページ", "https://creativecommons.org/licenses/by/4.0/"],
      ["別のリポジトリのファイル", "https://github.com/facebook/react/blob/main/LICENSE"],
      ["リポジトリのトップ", "https://github.com/reactjs/react.dev"],
      ["ディレクトリ（tree）", "https://github.com/reactjs/react.dev/tree/main/src"],
      ["ファイルのパスが無い", "https://github.com/reactjs/react.dev/blob/main/"],
      ["http", "http://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md"],
      ["raw.githubusercontent.com", "https://raw.githubusercontent.com/reactjs/react.dev/main/LICENSE-DOCS.md"],
    ])("github の license_url が%sなら license_url のエラーになる", (_label, licenseUrl) => {
      const result = createSourceRequestSchema.safeParse({ ...GITHUB_REQUEST, license_url: licenseUrl })

      expect(result.success).toBe(false)
      expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(["license_url"])
    })

    it("github は license_spdx に LicenseRef-personal-use を選べない", () => {
      expect(createSourceRequestSchema.safeParse({ ...GITHUB_REQUEST, license_spdx: "LicenseRef-personal-use" }).success).toBe(false)
    })

    it("小文字にする前に形式を検証する（owner だけは失敗する）", () => {
      expect(detectSourceLicenseQueryStringSchema.safeParse({ repository: "ReactJS" }).success).toBe(false)
    })
  })
})
