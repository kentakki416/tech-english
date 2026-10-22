import { createHash } from "node:crypto"

import { extractDocument, type ExtractDocumentInput } from "../../src/document"

import { buildWords, readFixture } from "./helpers"

const GO_DOC_INPUT: ExtractDocumentInput = {
  content: readFixture("go-doc.html"),
  contentSelector: "main article",
  excludeSelectors: [".feedback"],
  fallbackTitle: "/doc/tidy",
  format: "html",
  url: "https://go.example.dev/doc/tidy",
}

/**
 * 見出し（1 語）と段落で、見出しを含めて wordCount 語の節を Markdown で作る
 */
const buildMarkdownSection = (title: string, wordCount: number): string => `## ${title}\n\n${buildWords(wordCount - 1)}.\n`

describe("extractDocument", () => {
  describe("正常系", () => {
    it("Markdown を見出し単位で切り分け、条件を満たす塊だけを candidates にする", () => {
      const content = [
        "# Guide",
        buildMarkdownSection("Alpha", 300),
        buildMarkdownSection("Beta", 400),
        buildMarkdownSection("Gamma", 50),
        "## Links\n",
        Array.from({ length: 60 }, (_, index) => `- [Link number ${index}](/link/${index})`).join("\n"),
      ].join("\n")

      const result = extractDocument({ content, fallbackTitle: "docs/guide.md", format: "markdown" })

      expect(result.title).toBe("Guide")
      expect(result.chunks.map(({ rejectReasons, title, wordCount }) => ({ rejectReasons, title, wordCount }))).toEqual([
        { rejectReasons: [], title: "Guide", wordCount: 301 },
        { rejectReasons: [], title: "Beta", wordCount: 400 },
        { rejectReasons: ["not_prose"], title: "Gamma", wordCount: 231 },
      ])
      expect(result.candidates.map(({ title }) => title)).toEqual(["Guide", "Beta"])
      expect(result.wordCount).toBe(932)
    })

    it("タイトルが取れなければ fallbackTitle を使う", () => {
      const result = extractDocument({ content: "Just a paragraph.\n", fallbackTitle: "docs/plain.md", format: "markdown" })

      expect(result.title).toBe("docs/plain.md")
      expect(result.chunks[0]?.title).toBe("docs/plain.md")
    })

    it("HTML も文書全体の contentHash を持つ", () => {
      const result = extractDocument(GO_DOC_INPUT)

      expect(result.title).toBe("Writing Tidy Go Programs")
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(result.wordCount).toBeGreaterThan(0)
    })

    it.each([
      ["HTML", GO_DOC_INPUT],
      ["MDX", { content: readFixture("guide.mdx"), fallbackTitle: "guide.mdx", format: "mdx" }],
    ] satisfies [string, ExtractDocumentInput][])("%s：同じ入力で 2 回呼ぶと contentHash と chunks が同じ", (_, input) => {
      const first = extractDocument(input)
      const second = extractDocument(input)

      expect(second.contentHash).toBe(first.contentHash)
      expect(second.chunks).toEqual(first.chunks)
    })
  })

  describe("異常系", () => {
    it("contentSelector に合う要素が無いと chunks が空で wordCount = 0", () => {
      const result = extractDocument({ ...GO_DOC_INPUT, contentSelector: "#does-not-exist" })

      expect(result.chunks).toEqual([])
      expect(result.candidates).toEqual([])
      expect(result.wordCount).toBe(0)
      expect(result.contentHash).toBe(createHash("sha256").update("").digest("hex"))
    })

    it("JavaScript で本文を描画するページは英単語数 0", () => {
      const result = extractDocument({
        content: readFixture("js-rendered.html"),
        contentSelector: null,
        excludeSelectors: [],
        fallbackTitle: "/docs",
        format: "html",
        url: "https://app.example.dev/docs",
      })

      expect(result.wordCount).toBe(0)
      expect(result.chunks).toEqual([])
    })

    it("日本語の文書は not_english で candidates に入らない", () => {
      const content = `# 状態の管理\n\n${"この章では React の useState を使って状態を管理する方法を説明します。".repeat(30)}\n`

      const result = extractDocument({ content, fallbackTitle: "ja.md", format: "markdown" })

      expect(result.chunks[0]?.rejectReasons).toContain("not_english")
      expect(result.candidates).toEqual([])
    })

    it("壊れた .mdx は throw する", () => {
      expect(() => extractDocument({
        content: "# Title\n\n<Sandpack>\n\nThe component is never closed.\n",
        fallbackTitle: "broken.mdx",
        format: "mdx",
      })).toThrow()
    })
  })
})
