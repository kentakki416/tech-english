import { type SpeechPart, splitSpeechText } from "../../../src/lib/audio"

const MAX_LENGTH = 3000

/**
 * 各パートが上限以下で、元のテキストの同じ位置を指していること
 */
const expectValidParts = (speechText: string, parts: SpeechPart[], maxLength: number): void => {
  for (const part of parts) {
    expect(part.text.length).toBeLessThanOrEqual(maxLength)
    expect(part.text.length).toBeGreaterThan(0)
    expect(speechText.slice(part.start, part.start + part.text.length)).toBe(part.text)
    expect(part.text).toBe(part.text.trim())
  }
}

/**
 * 文を並べた長いテキスト（"Sentence 1 explains retries. Sentence 2 explains retries. ..."）
 */
const buildSentences = (count: number): string =>
  Array.from({ length: count }, (_, index) => `Sentence ${index + 1} explains how retries work.`).join(" ")

describe("splitSpeechText", () => {
  describe("正常系", () => {
    it("上限ちょうどの長さは 1 パート", () => {
      const speechText = "a".repeat(MAX_LENGTH)

      expect(splitSpeechText(speechText, MAX_LENGTH)).toEqual([{ start: 0, text: speechText }])
    })

    it("上限を超えたら文の区切りで分け、各パートは上限以下で文の終わりで終わる", () => {
      const speechText = buildSentences(200)

      const parts = splitSpeechText(speechText, MAX_LENGTH)

      expect(speechText.length).toBeGreaterThan(MAX_LENGTH * 2)
      expect(parts.length).toBeGreaterThanOrEqual(3)
      expectValidParts(speechText, parts, MAX_LENGTH)
      for (const part of parts) expect(part.text.endsWith("work.")).toBe(true)
      /**
       * 区切りの空白のほかは何も落とさない
       */
      expect(parts.map((part) => part.text).join(" ")).toBe(speechText)
    })

    it("閉じ括弧・引用符の後ろで切る", () => {
      const speechText = `He said "stop." ${"x ".repeat(20)}`

      const [first] = splitSpeechText(speechText, 20)

      expect(first?.text).toBe("He said \"stop.\"")
    })

    it("文の区切りが無ければ最後の空白で切る", () => {
      const speechText = "retry ".repeat(1000).trim()

      const parts = splitSpeechText(speechText, MAX_LENGTH)

      expect(parts.length).toBeGreaterThan(1)
      expectValidParts(speechText, parts, MAX_LENGTH)
      for (const part of parts) expect(part.text.split(" ").every((word) => word === "retry")).toBe(true)
    })

    it("空白も無ければ上限の長さで切る", () => {
      const speechText = "x".repeat(MAX_LENGTH * 2 + 1000)

      const parts = splitSpeechText(speechText, MAX_LENGTH)

      expect(parts.map((part) => [part.start, part.text.length])).toEqual([
        [0, MAX_LENGTH],
        [MAX_LENGTH, MAX_LENGTH],
        [MAX_LENGTH * 2, 1000],
      ])
    })

    it("先頭の空白を除いた分 start が進む", () => {
      expect(splitSpeechText("   Hello there.  ", MAX_LENGTH)).toEqual([{ start: 3, text: "Hello there." }])
    })
  })

  describe("異常系", () => {
    it("サロゲートペアの間では切らない", () => {
      const speechText = "😀".repeat(2000)

      const parts = splitSpeechText(speechText, 3001)

      expect(parts[0]?.text.length).toBe(3000)
      expectValidParts(speechText, parts, 3001)
      expect(parts.map((part) => part.text).join("")).toBe(speechText)
    })

    it("空白だけなら 0 パート", () => {
      expect(splitSpeechText("  \n ", MAX_LENGTH)).toEqual([])
    })
  })
})
