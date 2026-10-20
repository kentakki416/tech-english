import { calculateContentHash } from "../../src/document/content-hash"
import { splitIntoChunks } from "../../src/document/split-into-chunks"

import { buildHeading, buildParagraph, buildSection } from "./helpers"

const DOCUMENT_TITLE = "Document Title"

describe("splitIntoChunks", () => {
  describe("正常系", () => {
    it("h2 / h3 の見出しで区切り、h4 では区切らない", () => {
      const blocks = [
        ...buildSection("Alpha", 250, 2),
        ...buildSection("Beta", 250, 3),
        ...buildSection("Gamma", 100, 4),
      ]

      const chunks = splitIntoChunks(blocks, DOCUMENT_TITLE)

      expect(chunks.map(({ title, wordCount }) => ({ title, wordCount }))).toEqual([
        { title: "Alpha", wordCount: 250 },
        { title: "Beta", wordCount: 350 },
      ])
    })

    it("h1 でも区切り、最初の見出しより前のブロックも 1 つの節にする（タイトルは文書のタイトル）", () => {
      const blocks = [buildParagraph(250), ...buildSection("Top", 250, 1)]

      const chunks = splitIntoChunks(blocks, DOCUMENT_TITLE)

      expect(chunks.map(({ title, wordCount }) => ({ title, wordCount }))).toEqual([
        { title: DOCUMENT_TITLE, wordCount: 250 },
        { title: "Top", wordCount: 250 },
      ])
    })

    it("150 語 + 100 語は結合して 1 塊にする", () => {
      const chunks = splitIntoChunks([...buildSection("Alpha", 150), ...buildSection("Beta", 100)], DOCUMENT_TITLE)

      expect(chunks.map(({ rejectReasons, title, wordCount }) => ({ rejectReasons, title, wordCount }))).toEqual([
        { rejectReasons: [], title: "Alpha", wordCount: 250 },
      ])
    })

    it("250 語 + 100 語は 200 語以上の塊を確定するので 2 塊になる", () => {
      const chunks = splitIntoChunks([...buildSection("Alpha", 250), ...buildSection("Beta", 100)], DOCUMENT_TITLE)

      expect(chunks.map(({ rejectReasons, wordCount }) => ({ rejectReasons, wordCount }))).toEqual([
        { rejectReasons: [], wordCount: 250 },
        { rejectReasons: ["too_short"], wordCount: 100 },
      ])
    })

    it("150 語 + 500 語は結合すると 600 語を超えるので 2 塊になり、前者は too_short", () => {
      const chunks = splitIntoChunks([...buildSection("Alpha", 150), ...buildSection("Beta", 500)], DOCUMENT_TITLE)

      expect(chunks.map(({ rejectReasons, wordCount }) => ({ rejectReasons, wordCount }))).toEqual([
        { rejectReasons: ["too_short"], wordCount: 150 },
        { rejectReasons: [], wordCount: 500 },
      ])
    })

    it("700 語の節は 600 語以下の塊に分かれ、後ろの塊のタイトルは節の見出しに番号を付けたものになる", () => {
      const blocks = [buildHeading("Long", 2), ...Array.from({ length: 7 }, () => buildParagraph(100))]

      const chunks = splitIntoChunks(blocks, DOCUMENT_TITLE)

      expect(chunks.map(({ rejectReasons, title, wordCount }) => ({ rejectReasons, title, wordCount }))).toEqual([
        { rejectReasons: [], title: "Long", wordCount: 501 },
        { rejectReasons: [], title: "Long (2)", wordCount: 200 },
      ])
      expect(chunks[1]?.blocks.some((block) => block.type === "heading")).toBe(false)
    })

    it("最初の見出しより前の 700 語は、後ろの塊のタイトルが文書のタイトルに番号を付けたものになる", () => {
      const chunks = splitIntoChunks(Array.from({ length: 7 }, () => buildParagraph(100)), DOCUMENT_TITLE)

      expect(chunks.map(({ title }) => title)).toEqual([DOCUMENT_TITLE, `${DOCUMENT_TITLE} (2)`])
    })

    it("分けた後ろの塊に h4 の見出しがあれば、番号を付けずにその見出しをタイトルにする", () => {
      /**
       * 見出し 1 語 + 599 語でちょうど 600 語になり、h4 の前で分かれる
       */
      const blocks = [buildHeading("Long", 2), buildParagraph(599), buildHeading("Detail", 4), buildParagraph(100)]

      const chunks = splitIntoChunks(blocks, DOCUMENT_TITLE)

      expect(chunks.map(({ title }) => title)).toEqual(["Long", "Detail"])
    })

    it("塊のブロックは headingDepth を落とした PassageBlock で、contentHash は塊のブロックのハッシュ", () => {
      const [chunk] = splitIntoChunks(buildSection("Alpha", 250), DOCUMENT_TITLE)

      expect(chunk?.blocks[0]).toStrictEqual({ text: "Alpha", type: "heading" })
      expect(chunk?.contentHash).toBe(calculateContentHash(chunk?.blocks ?? []))
    })
  })

  describe("異常系", () => {
    it("601 語の 1 段落は分けられずに too_long になる", () => {
      const chunks = splitIntoChunks([buildParagraph(601)], DOCUMENT_TITLE)

      expect(chunks.map(({ rejectReasons, title, wordCount }) => ({ rejectReasons, title, wordCount }))).toEqual([
        { rejectReasons: ["too_long"], title: DOCUMENT_TITLE, wordCount: 601 },
      ])
    })

    it("199 語の節は too_short", () => {
      const chunks = splitIntoChunks(buildSection("Alpha", 199), DOCUMENT_TITLE)

      expect(chunks.map(({ rejectReasons }) => rejectReasons)).toEqual([["too_short"]])
    })

    it("ブロックが無ければ空配列", () => {
      expect(splitIntoChunks([], DOCUMENT_TITLE)).toEqual([])
    })
  })
})
