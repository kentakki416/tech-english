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
  tag_ids: [],
}

/**
 * 1〜count の連番
 */
const buildSequence = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1)

describe("admin content-source schema", () => {
  describe("正常系", () => {
    it.each([
      ["登録", createContentSourceRequestSchema],
      ["更新", updateContentSourceRequestSchema],
    ])("%sのリクエストの repository を小文字にそろえる", (_label, schema) => {
      const parsed = schema.parse({ ...GITHUB_REQUEST, repository: "ReactJS/React.dev" })

      expect(parsed).toMatchObject({ repository: "reactjs/react.dev" })
    })

    it.each([
      ["空", []],
      ["2 個", [1, 2]],
      ["10 個（境界値）", buildSequence(10)],
    ])("登録・更新のリクエストの tag_ids は%sなら通る", (_label, tagIds) => {
      expect(createContentSourceRequestSchema.parse({ ...GITHUB_REQUEST, tag_ids: tagIds })).toMatchObject({ tag_ids: tagIds })
      expect(updateContentSourceRequestSchema.parse({ ...GITHUB_REQUEST, tag_ids: tagIds })).toMatchObject({ tag_ids: tagIds })
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

    it.each([
      ["重複がある", { ...GITHUB_REQUEST, tag_ids: [1, 1] }],
      ["11 個（境界値）", { ...GITHUB_REQUEST, tag_ids: buildSequence(11) }],
      ["0", { ...GITHUB_REQUEST, tag_ids: [0] }],
      ["負の数", { ...GITHUB_REQUEST, tag_ids: [-1] }],
      ["小数", { ...GITHUB_REQUEST, tag_ids: [1.5] }],
      ["文字列", { ...GITHUB_REQUEST, tag_ids: ["1"] }],
      ["省略（古い形の tags だけ）", { ...GITHUB_REQUEST, tag_ids: undefined, tags: ["react"] }],
    ])("登録・更新のリクエストの tag_ids が%sなら失敗する", (_label, body) => {
      expect(createContentSourceRequestSchema.safeParse(body).success).toBe(false)
      expect(updateContentSourceRequestSchema.safeParse(body).success).toBe(false)
    })

    it("小文字にする前に形式を検証する（owner だけは失敗する）", () => {
      expect(detectContentSourceLicenseQueryStringSchema.safeParse({ repository: "ReactJS" }).success).toBe(false)
    })
  })
})
