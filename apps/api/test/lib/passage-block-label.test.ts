import type { PassageBlockType } from "@repo/domain"

import { formatBlockLabel, joinBlockLabel } from "../../src/lib/passage-block-label"

const BLOCKS = (["heading", "paragraph", "code", "heading", "list_item"] as PassageBlockType[]).map((type) => ({ type }))

describe("formatBlockLabel", () => {
  describe("正常系", () => {
    it.each([
      [0, "見出し 1"],
      [1, "段落 1"],
      [2, "コード"],
      [3, "見出し 2"],
      [4, "段落 2"],
    ])("ブロック %i は「%s」（見出しは見出しだけ、段落は見出しとコードを除いて数える）", (blockIndex, label) => {
      expect(formatBlockLabel(BLOCKS, blockIndex)).toBe(label)
    })
  })

  describe("異常系", () => {
    it("範囲外は「ブロック n」（1 始まり）", () => {
      expect(formatBlockLabel(BLOCKS, 9)).toBe("ブロック 10")
    })
  })
})

describe("joinBlockLabel", () => {
  describe("正常系", () => {
    it("表記の末尾が数字なら空白を挟み、それ以外は続けて書く", () => {
      expect(joinBlockLabel("見出し 2", "の和訳が空です")).toBe("見出し 2 の和訳が空です")
      expect(joinBlockLabel("コード", "の本文")).toBe("コードの本文")
    })
  })
})
