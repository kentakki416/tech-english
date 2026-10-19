import type { PassageBlock } from "@repo/domain"

import {
  findEvidenceSegmentRange,
  forTesting,
  type GlossarySpan,
  segmentPassage,
  type SegmentWithRange,
} from "../../src/lib/segment-passage"
import { PASSAGE_BLOCKS } from "../fixture/passage-content"

const { segmentBlockText } = forTesting

/**
 * 本文中の surface の位置の用語集（ブロックは 0）
 */
const buildGlossarySpan = (id: number, text: string, surface: string, blockIndex = 0): GlossarySpan => {
  const startOffset = text.indexOf(surface)
  if (startOffset === -1) throw new Error(`Surface not found in test text: ${surface}`)
  return { id, blockIndex, endOffset: startOffset + surface.length, startOffset, surface }
}

/**
 * セグメントの種類と文字列（位置と用語集の ID を見ないテスト用）
 */
const summarizeSegments = (segments: SegmentWithRange[]) => segments.map(({ kind, text }) => ({ kind, text }))

const listGlossaryEntryIdsByBlock = (segmentsByBlock: SegmentWithRange[][]): number[][] =>
  segmentsByBlock.map((segments) => segments.flatMap((segment) => segment.glossaryEntryId ?? []))

/**
 * code だけバッククォートで囲み直して連結する（不変条件の確認用）
 */
const restoreText = (segments: SegmentWithRange[]): string =>
  segments.map((segment) => (segment.kind === "code" ? `\`${segment.text}\`` : segment.text)).join("")

describe("segmentBlockText", () => {
  describe("正常系", () => {
    it("単語・空白・記号に分け、位置を元の本文の [start, end) で持つ。React's・re-render は 1 語、2. は記号", () => {
      expect(segmentBlockText("React's components re-render, step 2.", [])).toEqual([
        { canLookUp: true, end: 7, kind: "word", start: 0, text: "React's" },
        { end: 8, kind: "space", start: 7, text: " " },
        { canLookUp: true, end: 18, kind: "word", start: 8, text: "components" },
        { end: 19, kind: "space", start: 18, text: " " },
        { canLookUp: true, end: 28, kind: "word", start: 19, text: "re-render" },
        { end: 29, kind: "punct", start: 28, text: "," },
        { end: 30, kind: "space", start: 29, text: " " },
        { canLookUp: true, end: 34, kind: "word", start: 30, text: "step" },
        { end: 35, kind: "space", start: 34, text: " " },
        { end: 37, kind: "punct", start: 35, text: "2." },
      ])
    })

    it("インラインコードはバッククォートを除いた code にし（位置はバッククォートを含む）、対になっていないバッククォートは記号にする", () => {
      expect(segmentBlockText("Call `useEffect()` and ` then.", [])).toEqual([
        { canLookUp: true, end: 4, kind: "word", start: 0, text: "Call" },
        { end: 5, kind: "space", start: 4, text: " " },
        { end: 18, kind: "code", start: 5, text: "useEffect()" },
        { end: 19, kind: "space", start: 18, text: " " },
        { canLookUp: false, end: 22, kind: "word", start: 19, text: "and" },
        { end: 23, kind: "space", start: 22, text: " " },
        { end: 24, kind: "punct", start: 23, text: "`" },
        { end: 25, kind: "space", start: 24, text: " " },
        { canLookUp: false, end: 29, kind: "word", start: 25, text: "then" },
        { end: 30, kind: "punct", start: 29, text: "." },
      ])
    })

    it("名詞・動詞の単語は canLookUp が true、機能語は false。third-party は party が名詞なので true、don't は false", () => {
      const text = "The widget is a third-party tool, so we don't run it here."

      const segments = segmentBlockText(text, [])

      expect(segments.filter((segment) => segment.kind === "word").map(({ canLookUp, text }) => ({ canLookUp, text }))).toEqual([
        { canLookUp: false, text: "The" },
        { canLookUp: true, text: "widget" },
        { canLookUp: false, text: "is" },
        { canLookUp: false, text: "a" },
        { canLookUp: true, text: "third-party" },
        { canLookUp: true, text: "tool" },
        { canLookUp: false, text: "so" },
        { canLookUp: false, text: "we" },
        { canLookUp: false, text: "don't" },
        { canLookUp: true, text: "run" },
        { canLookUp: false, text: "it" },
        { canLookUp: false, text: "here" },
      ])
    })

    it("インラインコードの中身は品詞の判定に使わず、コードの後ろの単語も品詞で判定する", () => {
      const segments = segmentBlockText("Call `setState(next)` to update the widget.", [])

      expect(segments.filter((segment) => segment.kind === "word").map(({ canLookUp, text }) => ({ canLookUp, text }))).toEqual([
        { canLookUp: true, text: "Call" },
        { canLookUp: false, text: "to" },
        { canLookUp: true, text: "update" },
        { canLookUp: false, text: "the" },
        { canLookUp: true, text: "widget" },
      ])
    })

    it("空白・記号・コードのセグメントは canLookUp を持たない", () => {
      const segments = segmentBlockText("Call `useEffect()`, then return.", [])

      expect(segments.filter((segment) => segment.kind !== "word" && "canLookUp" in segment)).toEqual([])
    })

    it("用語集の語句は品詞に関係なく canLookUp が true（形容詞の external）", () => {
      const text = "Some components need to stay in sync with external systems."

      const segments = segmentBlockText(text, [buildGlossarySpan(3, text, "external")])

      expect(segments.find((segment) => segment.glossaryEntryId === 3)).toEqual({
        canLookUp: true,
        end: 50,
        glossaryEntryId: 3,
        kind: "word",
        start: 42,
        text: "external",
      })
    })

    it("熟語の用語集（opt out of）は glossaryEntryId つきの 1 つの word になる", () => {
      const text = "You can opt out of re-running an Effect."

      const segments = segmentBlockText(text, [buildGlossarySpan(7, text, "opt out of")])

      expect(segments.filter((segment) => segment.glossaryEntryId !== undefined)).toEqual([
        { canLookUp: true, end: 18, glossaryEntryId: 7, kind: "word", start: 8, text: "opt out of" },
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
        { id: 1, blockIndex: 0, endOffset: 8, startOffset: 2, surface: "e `use" },
        /**
         * 本文の外まで続く / 開始が負 / 空の範囲
         */
        { id: 2, blockIndex: 0, endOffset: 100, startOffset: 35, surface: "memory." },
        { id: 3, blockIndex: 0, endOffset: 3, startOffset: -1, surface: "Use" },
        { id: 4, blockIndex: 0, endOffset: 14, startOffset: 14, surface: "" },
        /**
         * 後から始まって重なる / 同じ開始で短い
         */
        buildGlossarySpan(5, text, "a value in memory"),
        buildGlossarySpan(6, text, "cache"),
        buildGlossarySpan(7, text, "cache a value"),
      ])

      expect(segments.filter((segment) => segment.glossaryEntryId !== undefined)).toEqual([
        { canLookUp: true, end: 30, glossaryEntryId: 7, kind: "word", start: 17, text: "cache a value" },
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
    it("用語集の語句は、保存してある位置に加えて同じ段落・ほかの段落の同じ表記の出現も同じ glossaryEntryId を持ち、code のブロックは []", () => {
      const blocks: PassageBlock[] = [
        { text: "An escape hatch helps. Use an escape hatch sparingly.", type: "paragraph" },
        { lang: "js", text: "const escape hatch = 1", type: "code" },
        { text: "No escape hatch here.", type: "paragraph" },
      ]
      const glossary = [buildGlossarySpan(11, blocks[0]?.text ?? "", "escape hatch", 0)]

      const segmentsByBlock = segmentPassage(blocks, glossary)

      expect(segmentsByBlock[1]).toEqual([])
      expect(listGlossaryEntryIdsByBlock(segmentsByBlock)).toEqual([[11, 11], [], [11]])
      expect(segmentsByBlock[2]?.find((segment) => segment.glossaryEntryId === 11)).toEqual({
        canLookUp: true,
        end: 15,
        glossaryEntryId: 11,
        kind: "word",
        start: 3,
        text: "escape hatch",
      })
    })

    it("表記が同じ項目が 2 つあれば、保存してある位置ではその項目を使い、どちらの位置でもない出現は ID の小さい方を使う", () => {
      const blocks: PassageBlock[] = [
        { text: "React keeps the state.", type: "paragraph" },
        { text: "Then state the reason.", type: "paragraph" },
        { text: "Every state is local.", type: "paragraph" },
      ]
      const glossary = [
        buildGlossarySpan(21, blocks[0]?.text ?? "", "state", 0),
        buildGlossarySpan(22, blocks[1]?.text ?? "", "state", 1),
      ]

      expect(listGlossaryEntryIdsByBlock(segmentPassage(blocks, glossary))).toEqual([[21], [22], [21]])
    })

    it("2 回目の出現が保存してある位置の用語集と重なったら、開始が早くても保存してある方を残す", () => {
      const blocks: PassageBlock[] = [
        { text: "Effects are an escape hatch.", type: "paragraph" },
        { text: "Use an escape hatch from React.", type: "paragraph" },
      ]
      const glossary = [
        buildGlossarySpan(11, blocks[0]?.text ?? "", "escape hatch", 0),
        buildGlossarySpan(12, blocks[1]?.text ?? "", "hatch from React", 1),
      ]

      const segmentsByBlock = segmentPassage(blocks, glossary)

      expect(listGlossaryEntryIdsByBlock(segmentsByBlock)).toEqual([[11], [12]])
      expect(summarizeSegments(segmentsByBlock[1] ?? []).map((segment) => segment.text)).toEqual([
        "Use", " ", "an", " ", "escape", " ", "hatch from React", ".",
      ])
    })

    it("2 回目の出現どうしが重なったら、開始が早い方を残す", () => {
      const blocks: PassageBlock[] = [
        { text: "An escape hatch and a hatch from React.", type: "paragraph" },
        { text: "Use an escape hatch from React.", type: "paragraph" },
      ]
      const glossary = [
        buildGlossarySpan(11, blocks[0]?.text ?? "", "escape hatch", 0),
        buildGlossarySpan(12, blocks[0]?.text ?? "", "hatch from React", 0),
      ]

      const segmentsByBlock = segmentPassage(blocks, glossary)

      expect(listGlossaryEntryIdsByBlock(segmentsByBlock)).toEqual([[11, 12], [11]])
    })
  })

  describe("異常系", () => {
    it.each([
      ["語の一部（option・adopt の中の opt）", "Pick an option or adopt it."],
      ["大文字小文字が違う（Opt）", "Opt in later."],
    ])("%sは用語集にしない", (_label, text) => {
      const blocks: PassageBlock[] = [
        { text: "You can opt in.", type: "paragraph" },
        { text, type: "paragraph" },
      ]

      const segmentsByBlock = segmentPassage(blocks, [buildGlossarySpan(5, blocks[0]?.text ?? "", "opt", 0)])

      expect(listGlossaryEntryIdsByBlock(segmentsByBlock)).toEqual([[5], []])
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
        { canLookUp: true, end: 26, kind: "word", start: 23, text: "use" },
        { end: 27, kind: "space", start: 26, text: " " },
        { end: 37, kind: "code", start: 27, text: "fullName" },
        { end: 38, kind: "space", start: 37, text: " " },
        { canLookUp: false, end: 40, kind: "word", start: 38, text: "as" },
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
