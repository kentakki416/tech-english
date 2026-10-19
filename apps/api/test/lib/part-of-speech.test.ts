import { findLookupTargetRanges } from "../../src/lib/part-of-speech"

/**
 * 位置が指す本文の文字列（位置がずれていれば別の文字列になる）
 */
const sliceRanges = (text: string, ranges: { end: number; start: number }[]): string[] =>
  ranges.map((range) => text.slice(range.start, range.end))

describe("findLookupTargetRanges", () => {
  describe("正常系", () => {
    it("名詞・動詞の位置を返し、冠詞・前置詞・助動詞・be 動詞・代名詞・形容詞は返さない", () => {
      const text = "The widget is ready, so we can run it outside of the app."

      expect(sliceRanges(text, findLookupTargetRanges(text))).toEqual(["widget", "run", "app"])
    })

    it("React's は React の位置を返す（'s は返さない）", () => {
      const text = "React's state updates."

      expect(findLookupTargetRanges(text)).toEqual([
        { end: 5, start: 0 },
        { end: 13, start: 8 },
        { end: 21, start: 14 },
      ])
    })

    it("空文字は [] を返す", () => {
      expect(findLookupTargetRanges("")).toEqual([])
    })
  })
})
