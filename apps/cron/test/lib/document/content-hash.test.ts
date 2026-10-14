import { createHash } from "node:crypto"

import { calculateContentHash } from "../../../src/lib/document/content-hash"

describe("calculateContentHash", () => {
  describe("正常系", () => {
    it("空白の違い・大文字小文字の違いは同じ値になる", () => {
      const original = calculateContentHash([
        { text: "Hello World", type: "heading" },
        { text: "State lets a component remember.", type: "paragraph" },
      ])
      const reformatted = calculateContentHash([
        { text: "  hello\n world ", type: "heading" },
        { text: "STATE lets   a component\tremember.", type: "paragraph" },
      ])

      expect(reformatted).toBe(original)
    })

    it("正規化したテキストの SHA-256 を 16 進数で返す", () => {
      const expected = createHash("sha256").update("hello world").digest("hex")

      expect(calculateContentHash([{ text: "Hello", type: "heading" }, { text: "World", type: "paragraph" }])).toBe(expected)
    })
  })

  describe("異常系", () => {
    it("本文が違えば別の値になる", () => {
      const original = calculateContentHash([{ text: "State lets a component remember.", type: "paragraph" }])
      const changed = calculateContentHash([{ text: "State lets a component forget.", type: "paragraph" }])

      expect(changed).not.toBe(original)
    })
  })
})
