import { extractSentence } from "../../src/lib/extract-sentence"

/**
 * 語句の位置を本文から求めて切り出す（テストを読みやすくするため）
 */
const extract = (text: string, surface: string) => {
  const start = text.indexOf(surface)
  return extractSentence(text, { end: start + surface.length, start })
}

/**
 * 切り出した文の中で強調される語句
 */
const highlighted = (result: ReturnType<typeof extractSentence>) => result.text.slice(result.highlightStart, result.highlightEnd)

describe("extractSentence", () => {
  const BLOCK = "Effects run after rendering. You can opt out of re-running them. They are an escape hatch!"

  describe("正常系", () => {
    it("3 文のブロックで 2 文目の単語を渡すと 2 文目だけが返り、強調の位置が文の中を指す", () => {
      const result = extract(BLOCK, "opt out of")

      expect(result).toEqual({ highlightEnd: 18, highlightStart: 8, text: "You can opt out of re-running them." })
      expect(highlighted(result)).toBe("opt out of")
    })

    it("1 文目と、ブロックの端まで続く最後の文と、1 文だけのブロックを切り出す", () => {
      expect(extract(BLOCK, "rendering").text).toBe("Effects run after rendering.")
      expect(extract(BLOCK, "escape hatch").text).toBe("They are an escape hatch!")
      expect(extract("Just one sentence here", "one").text).toBe("Just one sentence here")
    })

    it("? と ! で区切り、直後に空白の無い .（Object.is・v1.2）では区切らない", () => {
      expect(extract("Is it fast? Use Object.is to compare v1.2 values. Done!", "compare").text).toBe("Use Object.is to compare v1.2 values.")
    })

    it("インラインコードの中の . では区切らない", () => {
      expect(extract("Call `a. b` before you mount it. Then render.", "mount").text).toBe("Call `a. b` before you mount it.")
    })

    it.each(["e.g.", "i.e.", "etc.", "vs."])("%s の後では区切らない", (abbreviation) => {
      const text = `Use a tool, ${abbreviation} a linter, to check it. Next sentence.`
      expect(extract(text, "linter").text).toBe(`Use a tool, ${abbreviation} a linter, to check it.`)
    })

    it("文の前後の空白（改行を含む）を除く", () => {
      const result = extract("First line.\n  Second line is here.  \n", "Second")
      expect(result.text).toBe("Second line is here.")
      expect(highlighted(result)).toBe("Second")
    })
  })

  describe("長い文（境界値）", () => {
    const buildSentence = (length: number, word: string, at: number) => {
      const filler = "x".repeat(length)
      return `${filler.slice(0, at)}${word}${filler.slice(at + word.length, length - 1)}.`
    }

    it("240 文字ちょうどの文は切らない", () => {
      const text = buildSentence(240, "word", 120)
      expect(text).toHaveLength(240)
      expect(extract(text, "word").text).toBe(text)
    })

    it("241 文字の文は 240 文字に切られ、切った側にだけ … が付き、強調が単語を指す", () => {
      const text = buildSentence(241, "word", 120)
      const result = extract(text, "word")

      expect(result.text).toBe(`…${text.slice(1)}`)
      expect(highlighted(result)).toBe("word")
    })

    it("長い文の真ん中の単語は、前後を切って両側に … が付く", () => {
      const result = extract(buildSentence(600, "word", 300), "word")

      expect(result.text.startsWith("…")).toBe(true)
      expect(result.text.endsWith("…")).toBe(true)
      expect(result.text).toHaveLength(242)
      expect(highlighted(result)).toBe("word")
    })

    it("単語が長い文の先頭にあれば後ろにだけ、末尾にあれば前にだけ … が付く", () => {
      const head = extract(buildSentence(400, "word", 0), "word")
      expect(head.text.startsWith("…")).toBe(false)
      expect(head.text.endsWith("…")).toBe(true)
      expect(highlighted(head)).toBe("word")

      const tail = extract(buildSentence(400, "word", 390), "word")
      expect(tail.text.startsWith("…")).toBe(true)
      expect(tail.text.endsWith("…")).toBe(false)
      expect(highlighted(tail)).toBe("word")
    })
  })
})
