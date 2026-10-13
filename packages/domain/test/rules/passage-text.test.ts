import { findSurfaceRange, hasQuote, isSurfaceAt, numberParagraphs } from "../../src/rules/passage-text"
import type { PassageBlockType } from "../../src/types/passage"

describe("findSurfaceRange", () => {
  describe("正常系", () => {
    it("最初の出現の位置を [startOffset, endOffset) で返す", () => {
      const text = "A cache stores data. The cache is fast."

      expect(findSurfaceRange(text, "cache")).toEqual({ endOffset: 7, startOffset: 2 })
    })

    it("単語の途中の出現（because の中の use）は採用せず、次の単語として独立した出現を返す", () => {
      const text = "This is because you use it."

      const range = findSurfaceRange(text, "use")

      expect(range).toEqual({ endOffset: 23, startOffset: 20 })
      expect(text.slice(range?.startOffset, range?.endOffset)).toBe("use")
    })

    it("熟語（opt out of）を 1 つの範囲として返す", () => {
      const text = "You can opt out of telemetry."

      expect(findSurfaceRange(text, "opt out of")).toEqual({ endOffset: 18, startOffset: 8 })
    })

    it("前後が記号・空白・文字列の端なら単語の区切りとして採用する", () => {
      expect(findSurfaceRange("caveat: none", "caveat")).toEqual({ endOffset: 6, startOffset: 0 })
      expect(findSurfaceRange("(idempotent)", "idempotent")).toEqual({ endOffset: 11, startOffset: 1 })
      expect(findSurfaceRange("it is idempotent", "idempotent")).toEqual({ endOffset: 16, startOffset: 6 })
    })

    it("バッククォートを含む本文でも、生の文字列上の位置を返す", () => {
      const text = "Call `useEffect` to opt in to sync."

      const range = findSurfaceRange(text, "opt in")

      expect(range).toEqual({ endOffset: 26, startOffset: 20 })
      expect(text.slice(range?.startOffset, range?.endOffset)).toBe("opt in")
    })

    it("インラインコードの中の語（バッククォートの直後）も単語の区切りとして見つかる", () => {
      expect(findSurfaceRange("Call `useEffect` here.", "useEffect")).toEqual({ endOffset: 15, startOffset: 6 })
    })
  })

  describe("異常系", () => {
    it("大文字小文字が違えば null", () => {
      expect(findSurfaceRange("Under the hood, it caches.", "under the hood")).toBeNull()
    })

    it("単語の途中にしか出現しなければ null（useEffect の中の use）", () => {
      expect(findSurfaceRange("Call `useEffect` because it reuses state.", "use")).toBeNull()
    })

    it("出現しなければ null", () => {
      expect(findSurfaceRange("A cache stores data.", "queue")).toBeNull()
    })

    it("surface が空文字なら null", () => {
      expect(findSurfaceRange("A cache stores data.", "")).toBeNull()
    })
  })
})

describe("isSurfaceAt", () => {
  const text = "You can opt out of telemetry."

  describe("正常系", () => {
    it("保存済みの位置に同じ表記があれば true", () => {
      expect(isSurfaceAt(text, { endOffset: 18, startOffset: 8, surface: "opt out of" })).toBe(true)
    })
  })

  describe("異常系", () => {
    it("位置が 1 文字でもずれていれば false", () => {
      expect(isSurfaceAt(text, { endOffset: 19, startOffset: 9, surface: "opt out of" })).toBe(false)
    })

    it("表記が違えば（大文字小文字も）false", () => {
      expect(isSurfaceAt(text, { endOffset: 18, startOffset: 8, surface: "Opt out of" })).toBe(false)
    })

    it("位置が本文の外なら false", () => {
      expect(isSurfaceAt(text, { endOffset: 110, startOffset: 100, surface: "opt out of" })).toBe(false)
    })
  })
})

describe("hasQuote", () => {
  describe("正常系", () => {
    it("本文の `useEffect` と引用の useEffect が一致する", () => {
      expect(hasQuote("Use `useEffect` to synchronize.", "Use useEffect to synchronize")).toBe(true)
    })

    it("引用の側にバッククォートがあっても一致する", () => {
      expect(hasQuote("Use useEffect to synchronize.", "Use `useEffect`")).toBe(true)
    })
  })

  describe("異常系", () => {
    it("本文に含まれなければ false", () => {
      expect(hasQuote("Use `useEffect` to synchronize.", "Use useMemo to synchronize")).toBe(false)
    })

    it("引用が空（バッククォートだけを含む）なら false", () => {
      expect(hasQuote("Use `useEffect` to synchronize.", "")).toBe(false)
      expect(hasQuote("Use `useEffect` to synchronize.", "``")).toBe(false)
    })
  })
})

describe("numberParagraphs", () => {
  describe("正常系", () => {
    it("heading と code は null、paragraph / list_item / quote は 1 から連番", () => {
      const types: PassageBlockType[] = ["heading", "paragraph", "code", "list_item", "list_item", "heading", "quote", "paragraph"]

      expect(numberParagraphs(types.map((type) => ({ type })))).toEqual([null, 1, null, 2, 3, null, 4, 5])
    })

    it("ブロックが無ければ空配列", () => {
      expect(numberParagraphs([])).toEqual([])
    })
  })
})
