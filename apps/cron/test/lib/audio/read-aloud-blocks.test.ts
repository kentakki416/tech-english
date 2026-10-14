import type { PassageBlock } from "@repo/domain"

import { calculateAudioTextHash, listReadAloudBlocks } from "../../../src/lib/audio"

const BLOCKS: PassageBlock[] = [
  { text: "Synchronizing with Effects", type: "heading" },
  { text: "Some components need to stay in sync with `window`.", translationJa: "一部のコンポーネントは…", type: "paragraph" },
  { lang: "js", text: "useEffect(() => {})", type: "code" },
  { text: "Use an Effect only when you need it.", type: "list_item" },
  { text: "  ", type: "paragraph" },
  { text: "` `", type: "quote" },
  { text: "Effects are an escape hatch.", type: "quote" },
]

describe("listReadAloudBlocks", () => {
  describe("正常系", () => {
    it("code のブロックと読み上げ用テキストが空白だけのブロックを除き、元の blockIndex を保つ", () => {
      expect(listReadAloudBlocks(BLOCKS)).toEqual([
        { blockIndex: 0, text: "Synchronizing with Effects" },
        { blockIndex: 1, text: "Some components need to stay in sync with `window`." },
        { blockIndex: 3, text: "Use an Effect only when you need it." },
        { blockIndex: 6, text: "Effects are an escape hatch." },
      ])
    })
  })

  describe("異常系", () => {
    it("ブロックが無ければ空", () => {
      expect(listReadAloudBlocks([])).toEqual([])
    })
  })
})

describe("calculateAudioTextHash", () => {
  describe("正常系", () => {
    it("同じ入力は同じ値（SHA-256 の hex）", () => {
      const hash = calculateAudioTextHash({ blocks: BLOCKS, voiceId: "Joanna" })

      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      expect(calculateAudioTextHash({ blocks: structuredClone(BLOCKS), voiceId: "Joanna" })).toBe(hash)
    })

    it("code のブロックと和訳が変わっても変わらない", () => {
      const hash = calculateAudioTextHash({ blocks: BLOCKS, voiceId: "Joanna" })
      const changed = BLOCKS.map((block) => {
        if (block.type === "code") return { ...block, text: "useEffect(() => { connect() })" }
        return block.translationJa ? { ...block, translationJa: "別の和訳" } : block
      })

      expect(calculateAudioTextHash({ blocks: changed, voiceId: "Joanna" })).toBe(hash)
    })
  })

  describe("異常系", () => {
    it("段落の英文が変わると変わる", () => {
      const hash = calculateAudioTextHash({ blocks: BLOCKS, voiceId: "Joanna" })
      const changed = BLOCKS.map((block, index) => (index === 3 ? { ...block, text: "Use an Effect sparingly." } : block))

      expect(calculateAudioTextHash({ blocks: changed, voiceId: "Joanna" })).not.toBe(hash)
    })

    it("voice が変わると変わる", () => {
      expect(calculateAudioTextHash({ blocks: BLOCKS, voiceId: "Matthew" })).not.toBe(
        calculateAudioTextHash({ blocks: BLOCKS, voiceId: "Joanna" }),
      )
    })

    it("読み上げるブロックの位置が変わると変わる（キーの blockIndex がずれるため）", () => {
      const hash = calculateAudioTextHash({ blocks: BLOCKS, voiceId: "Joanna" })
      const shifted: PassageBlock[] = [{ lang: "sh", text: "npm install", type: "code" }, ...BLOCKS]

      expect(calculateAudioTextHash({ blocks: shifted, voiceId: "Joanna" })).not.toBe(hash)
    })
  })
})
