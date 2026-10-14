import {
  createContentSourceRequestSchema,
  detectContentSourceLicenseQueryStringSchema,
  passageCountsSchema,
  updateContentSourceRequestSchema,
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
  tags: [],
}

describe("admin content-source schema", () => {
  describe("正常系", () => {
    it.each([
      ["登録", createContentSourceRequestSchema],
      ["更新", updateContentSourceRequestSchema],
    ])("%sのリクエストの repository を小文字にそろえる", (_label, schema) => {
      const parsed = schema.parse({ ...GITHUB_REQUEST, repository: "ReactJS/React.dev" })

      expect(parsed).toMatchObject({ repository: "reactjs/react.dev" })
    })

    it("検出ライセンス取得のクエリの repository を小文字にそろえる", () => {
      expect(detectContentSourceLicenseQueryStringSchema.parse({ repository: "Rust-Lang/Book" })).toEqual({ repository: "rust-lang/book" })
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

    it("小文字にする前に形式を検証する（owner だけは失敗する）", () => {
      expect(detectContentSourceLicenseQueryStringSchema.safeParse({ repository: "ReactJS" }).success).toBe(false)
    })
  })
})
