import type { PassageBlock } from "@repo/domain"

import {
  findEvidenceSegmentRange,
  type GlossarySpan,
  segmentBlockText,
  segmentPassage,
  type SegmentWithRange,
} from "../../src/lib/segment-passage"
import { PASSAGE_BLOCKS } from "../fixture/passage-content"

/**
 * 本文中の surface の位置の用語集（ブロックは 0）
 */
const buildGlossarySpan = (id: number, text: string, surface: string, blockIndex = 0): GlossarySpan => {
  const startOffset = text.indexOf(surface)
  if (startOffset === -1) throw new Error(`Surface not found in test text: ${surface}`)
  return { id, blockIndex, endOffset: startOffset + surface.length, startOffset }
}

/**
 * セグメントの種類と文字列（位置と用語集の ID を見ないテスト用）
 */
const summarizeSegments = (segments: SegmentWithRange[]) => segments.map(({ kind, text }) => ({ kind, text }))

/**
 * code だけバッククォートで囲み直して連結する（不変条件の確認用）
 */
const restoreText = (segments: SegmentWithRange[]): string =>
  segments.map((segment) => (segment.kind === "code" ? `\`${segment.text}\`` : segment.text)).join("")

describe("segmentBlockText", () => {
  describe("正常系", () => {
    it("単語・空白・記号に分け、位置を元の本文の [start, end) で持つ。React's・re-render は 1 語、2. は記号", () => {
      expect(segmentBlockText("React's components re-render, step 2.", [])).toEqual([
        { end: 7, kind: "word", start: 0, text: "React's" },
        { end: 8, kind: "space", start: 7, text: " " },
        { end: 18, kind: "word", start: 8, text: "components" },
        { end: 19, kind: "space", start: 18, text: " " },
        { end: 28, kind: "word", start: 19, text: "re-render" },
        { end: 29, kind: "punct", start: 28, text: "," },
        { end: 30, kind: "space", start: 29, text: " " },
        { end: 34, kind: "word", start: 30, text: "step" },
        { end: 35, kind: "space", start: 34, text: " " },
        { end: 37, kind: "punct", start: 35, text: "2." },
      ])
    })

    it("インラインコードはバッククォートを除いた code にし（位置はバッククォートを含む）、対になっていないバッククォートは記号にする", () => {
      expect(segmentBlockText("Call `useEffect()` and ` then.", [])).toEqual([
        { end: 4, kind: "word", start: 0, text: "Call" },
        { end: 5, kind: "space", start: 4, text: " " },
        { end: 18, kind: "code", start: 5, text: "useEffect()" },
        { end: 19, kind: "space", start: 18, text: " " },
        { end: 22, kind: "word", start: 19, text: "and" },
        { end: 23, kind: "space", start: 22, text: " " },
        { end: 24, kind: "punct", start: 23, text: "`" },
        { end: 25, kind: "space", start: 24, text: " " },
        { end: 29, kind: "word", start: 25, text: "then" },
        { end: 30, kind: "punct", start: 29, text: "." },
      ])
    })

    it("熟語の用語集（opt out of）は glossaryEntryId つきの 1 つの word になる", () => {
      const text = "You can opt out of re-running an Effect."

      const segments = segmentBlockText(text, [buildGlossarySpan(7, text, "opt out of")])

      expect(segments.filter((segment) => segment.glossaryEntryId !== undefined)).toEqual([
        { end: 18, glossaryEntryId: 7, kind: "word", start: 8, text: "opt out of" },
      ])
      expect(summarizeSegments(segments).map((segment) => segment.text)).toEqual([
        "You", " ", "can", " ", "opt out of", " ", "re-running", " ", "an", " ", "Effect", ".",
      ])
    })

    it("インラインコードと重なる用語集・範囲外の用語集は使わず、用語集どうしが重なったら開始が早い方（同じなら長い方）を残す", () => {
      const text = "Use `useMemo` to cache a value in memory."

      const segments = segmentBlockText(text, [
        /**
         * インラインコード（[4, 13)）と重なる
         */
        { id: 1, blockIndex: 0, endOffset: 8, startOffset: 2 },
        /**
         * 本文の外まで続く / 開始が負 / 空の範囲
         */
        { id: 2, blockIndex: 0, endOffset: 100, startOffset: 35 },
        { id: 3, blockIndex: 0, endOffset: 3, startOffset: -1 },
        { id: 4, blockIndex: 0, endOffset: 14, startOffset: 14 },
        /**
         * 後から始まって重なる / 同じ開始で短い
         */
        buildGlossarySpan(5, text, "a value in memory"),
        buildGlossarySpan(6, text, "cache"),
        buildGlossarySpan(7, text, "cache a value"),
      ])

      expect(segments.filter((segment) => segment.glossaryEntryId !== undefined)).toEqual([
        { end: 30, glossaryEntryId: 7, kind: "word", start: 17, text: "cache a value" },
      ])
      expect(summarizeSegments(segments)).toEqual([
        { kind: "word", text: "Use" },
        { kind: "space", text: " " },
        { kind: "code", text: "useMemo" },
        { kind: "space", text: " " },
        { kind: "word", text: "to" },
        { kind: "space", text: " " },
        { kind: "word", text: "cache a value" },
        { kind: "space", text: " " },
        { kind: "word", text: "in" },
        { kind: "space", text: " " },
        { kind: "word", text: "memory" },
        { kind: "punct", text: "." },
      ])
    })

    it.each([
      ["fixture の段落", PASSAGE_BLOCKS[1]?.text ?? ""],
      ["インラインコードが複数", "Pass `a` and `b` to `useEffect(fn, deps)`."],
      ["対になっていない・空のバッククォート", "Use `` or ` alone, then `code`"],
      ["改行をまたぐバッククォート", "Begin `not\ncode` end"],
      ["数字・非 ASCII・絵文字・カーリークォート", "Node 20.x で動く 🚀 — it’s “fast”, isn’t it?"],
      ["先頭と末尾の空白・タブ・改行", "  leading\tand trailing\n"],
      ["空文字", ""],
    ])("不変条件：%sでも、code をバッククォートで囲み直して連結すると元の本文に戻り、位置は隙間なく本文を覆う", (_label, text) => {
      const glossary = text.includes("and") ? [buildGlossarySpan(1, text, "and")] : []

      const segments = segmentBlockText(text, glossary)

      expect(restoreText(segments)).toBe(text)
      let cursor = 0
      for (const segment of segments) {
        expect(segment.start).toBe(cursor)
        expect(text.slice(segment.start, segment.end)).toBe(segment.kind === "code" ? `\`${segment.text}\`` : segment.text)
        cursor = segment.end
      }
      expect(cursor).toBe(text.length)
    })
  })
})

describe("segmentPassage", () => {
  describe("正常系", () => {
    it("ブロックごとにそのブロックの用語集だけを使い、code のブロックは []", () => {
      const blocks: PassageBlock[] = [
        { text: "Escape hatch", type: "heading" },
        { text: "An escape hatch helps.", type: "paragraph" },
        { lang: "js", text: "const hatch = `escape`", type: "code" },
        { text: "No escape hatch here.", type: "paragraph" },
      ]
      const glossary: GlossarySpan[] = [
        buildGlossarySpan(11, blocks[1]?.text ?? "", "escape hatch", 1),
        buildGlossarySpan(12, blocks[2]?.text ?? "", "hatch", 2),
      ]

      const segmentsByBlock = segmentPassage(blocks, glossary)

      expect(segmentsByBlock).toHaveLength(4)
      expect(segmentsByBlock[2]).toEqual([])
      expect(segmentsByBlock.map((segments) => segments.flatMap((segment) => segment.glossaryEntryId ?? []))).toEqual([
        [],
        [11],
        [],
        [],
      ])
      expect(summarizeSegments(segmentsByBlock[3] ?? []).map((segment) => segment.text)).toEqual([
        "No", " ", "escape", " ", "hatch", " ", "here", ".",
      ])
    })
  })
})

describe("findEvidenceSegmentRange", () => {
  const text = "Some components need to stay in sync with external systems. Effects are an escape hatch from the React paradigm."

  describe("正常系", () => {
    it("段落の途中の引用と重なるセグメントの添字の範囲を返す（end は含まない）", () => {
      const segments = segmentBlockText(text, [])

      const range = findEvidenceSegmentRange(text, segments, "Effects are an escape hatch")

      expect(range).toEqual({ end: 30, start: 21 })
      expect(segments.slice(range?.start, range?.end).map((segment) => segment.text).join("")).toBe("Effects are an escape hatch")
    })

    it("用語集のセグメントの一部だけにかかる引用は、その用語集のセグメントを含めた範囲を返す", () => {
      const segments = segmentBlockText(text, [buildGlossarySpan(9, text, "escape hatch")])

      const range = findEvidenceSegmentRange(text, segments, "an escape")

      expect(range).toEqual({ end: 28, start: 25 })
      expect(segments.slice(range?.start, range?.end).map((segment) => segment.text)).toEqual(["an", " ", "escape hatch"])
    })

    it("インラインコードのバッククォートを省いた引用も、バッククォートを除いた本文で探して見つける", () => {
      const codeText = "A common mistake is to use `fullName` as state."
      const segments = segmentBlockText(codeText, [])

      const range = findEvidenceSegmentRange(codeText, segments, "use fullName as")

      expect(segments.slice(range?.start, range?.end)).toEqual([
        { end: 26, kind: "word", start: 23, text: "use" },
        { end: 27, kind: "space", start: 26, text: " " },
        { end: 37, kind: "code", start: 27, text: "fullName" },
        { end: 38, kind: "space", start: 37, text: " " },
        { end: 40, kind: "word", start: 38, text: "as" },
      ])
    })
  })

  describe("異常系", () => {
    it.each([
      ["本文に無い引用", "Effects are a trapdoor"],
      ["空の引用", ""],
      ["バッククォートだけの引用", "``"],
    ])("%sは null を返す", (_label, quote) => {
      expect(findEvidenceSegmentRange(text, segmentBlockText(text, []), quote)).toBeNull()
    })
  })
})
