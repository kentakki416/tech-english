import { createUtf8ToUtf16IndexMap } from "../../../src/lib/audio"

/**
 * text の中の word の UTF-8 のバイト位置
 */
const findByteOffset = (text: string, word: string): number => Buffer.byteLength(text.slice(0, text.indexOf(word)))

describe("createUtf8ToUtf16IndexMap", () => {
  describe("正常系", () => {
    it("ASCII はバイト位置と UTF-16 の位置が同じ", () => {
      const text = "Effects run after render."

      const map = createUtf8ToUtf16IndexMap(text)

      expect([...map]).toEqual([...Array(text.length + 1).keys()])
    })

    it.each([
      ["2 バイトの文字", "café ok", "ok", 6, 5],
      ["3 バイトの文字", "日本語 text", "text", 10, 4],
      ["絵文字（4 バイト・サロゲートペア）", "🚀 Launch", "Launch", 5, 3],
      ["全角の括弧", "（注）Note", "Note", 9, 3],
    ])("%s の後ろの単語のバイト位置を UTF-16 の位置にする", (_label, text, word, byteOffset, utf16Index) => {
      const map = createUtf8ToUtf16IndexMap(text)

      expect(findByteOffset(text, word)).toBe(byteOffset)
      expect(map[byteOffset]).toBe(utf16Index)
      expect(text.slice(utf16Index, utf16Index + word.length)).toBe(word)
    })

    it("長さはバイト数 + 1 で、末尾のバイト位置は text.length", () => {
      const text = "🚀 café（注）"

      const map = createUtf8ToUtf16IndexMap(text)

      expect(map).toHaveLength(Buffer.byteLength(text) + 1)
      expect(map[Buffer.byteLength(text)]).toBe(text.length)
    })

    it("コードポイントの途中のバイトはそのコードポイントの先頭の位置", () => {
      const map = createUtf8ToUtf16IndexMap("a🚀b")

      expect([...map]).toEqual([0, 1, 1, 1, 1, 3, 4])
    })
  })

  describe("異常系", () => {
    it("孤立したサロゲートは U+FFFD（3 バイト）として数え、Buffer.byteLength と一致する", () => {
      const text = "\uD800a"

      const map = createUtf8ToUtf16IndexMap(text)

      expect(map).toHaveLength(Buffer.byteLength(text) + 1)
      expect([...map]).toEqual([0, 0, 0, 1, 2])
    })

    it("空文字は [0]", () => {
      expect([...createUtf8ToUtf16IndexMap("")]).toEqual([0])
    })
  })
})
