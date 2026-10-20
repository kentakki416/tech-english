import type { ExtractedDocument, PassageChunk } from "@repo/content-extractor"

import { formatDryRun, type SourcePreview } from "../../src/lib/format-dry-run"

const buildChunk = (overrides: Partial<PassageChunk>): PassageChunk => ({
  blocks: [{ text: "Short text.", type: "paragraph" }],
  contentHash: "hash",
  rejectReasons: [],
  title: "Chunk",
  wordCount: 250,
  ...overrides,
})

const buildDocument = (chunks: PassageChunk[]): ExtractedDocument => ({
  candidates: chunks.filter((chunk) => chunk.rejectReasons.length === 0),
  chunks,
  contentHash: "document-hash",
  links: [],
  title: "Escape Hatches",
  wordCount: 1234,
})

const buildPreview = (overrides: Partial<SourcePreview>): SourcePreview => ({
  documents: [],
  fetchedFrom: "reactjs/react.dev @ 1a2b3c4",
  isComplete: true,
  sourceId: 12,
  sourceName: "React 公式ドキュメント",
  targetDocumentCount: 0,
  ...overrides,
})

describe("formatDryRun", () => {
  describe("正常系", () => {
    it("文書ごとに path・タイトル・英単語数、塊ごとに判定・タイトル・語数・本文の先頭を並べる", () => {
      const longText = `${"a".repeat(130)} tail`
      const text = formatDryRun(buildPreview({
        documents: [
          {
            document: buildDocument([
              buildChunk({ blocks: [{ text: "Refs   let you\nremember values.", type: "paragraph" }], title: "Refs", wordCount: 412 }),
              buildChunk({ blocks: [{ text: longText, type: "paragraph" }], rejectReasons: ["too_short", "not_prose"], title: "Recap", wordCount: 45 }),
            ]),
            path: "src/content/learn/escape-hatches.md",
            status: "extracted",
          },
          { errorMessage: "Unexpected end of file", path: "src/content/learn/broken.mdx", status: "failed" },
        ],
        targetDocumentCount: 12,
      }))

      expect(text).toBe([
        "ソース #12 React 公式ドキュメント（reactjs/react.dev @ 1a2b3c4）",
        "対象の文書 12 件のうち 2 件を取得しました（DB には書き込んでいません）",
        "",
        "■ src/content/learn/escape-hatches.md",
        "  タイトル: Escape Hatches / 英単語数: 1234 / 本文候補: 1 / 塊: 2",
        "  [OK] Refs（412 語）",
        "      Refs let you remember values.",
        "  [不採用: too_short, not_prose] Recap（45 語）",
        `      ${"a".repeat(120)}…`,
        "",
        "■ src/content/learn/broken.mdx",
        "  [抽出に失敗] Unexpected end of file",
        "",
      ].join("\n"))
    })

    it("サイトのページを取得できなかったものは理由を出す", () => {
      const text = formatDryRun(buildPreview({
        documents: [{ path: "/doc/gone", reason: "HTTP 404", status: "not_fetched" }],
        fetchedFrom: "https://go.dev（sitemap: https://go.dev/sitemap.xml）",
        targetDocumentCount: 3,
      }))

      expect(text).toBe([
        "ソース #12 React 公式ドキュメント（https://go.dev（sitemap: https://go.dev/sitemap.xml））",
        "対象の文書 3 件のうち 1 件を取得しました（DB には書き込んでいません）",
        "",
        "■ /doc/gone",
        "  [取得できず] HTTP 404",
        "",
      ].join("\n"))
    })

    it("ツリーが切り詰められていたら注意書きを出す", () => {
      expect(formatDryRun(buildPreview({ isComplete: false }))).toContain("ツリーが切り詰められたため")
    })
  })
})
