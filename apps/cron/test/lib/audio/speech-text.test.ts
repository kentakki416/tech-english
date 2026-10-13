import { buildSpeechText, mapSpeechRangeToSource } from "../../../src/lib/audio"

describe("buildSpeechText", () => {
  describe("正常系", () => {
    it("対になったインラインコードのバッククォートを除き、各位置に元の本文の位置を持つ", () => {
      const text = "Call `useEffect` here"

      const speech = buildSpeechText(text)

      expect(speech.speechText).toBe("Call useEffect here")
      expect(speech.sourceOffsets).toHaveLength(speech.speechText.length + 1)
      /**
       * 読み上げ用テキストの u（5 文字目）は元の本文の開きのバッククォートの次（6）
       */
      expect(speech.speechText[5]).toBe("u")
      expect(speech.sourceOffsets[5]).toBe(6)
      expect(text[speech.sourceOffsets[5] ?? -1]).toBe("u")
      /**
       * 閉じのバッククォートの後ろの空白（読み上げ用 14）は元の本文の 16
       */
      expect(speech.sourceOffsets[14]).toBe(16)
      expect(speech.sourceOffsets[speech.sourceOffsets.length - 1]).toBe(text.length)
    })

    it("複数のインラインコードがあっても、すべての文字が元の本文の同じ文字を指す", () => {
      const text = "Run `npm install` then `cd app`."

      const speech = buildSpeechText(text)

      expect(speech.speechText).toBe("Run npm install then cd app.")
      for (const [index, char] of [...speech.speechText].entries()) {
        expect(text[speech.sourceOffsets[index] ?? -1]).toBe(char)
      }
    })

    it("インラインコードの無い本文は位置がそのまま", () => {
      const text = "Effects let you synchronize."

      const speech = buildSpeechText(text)

      expect(speech.speechText).toBe(text)
      expect(speech.sourceOffsets).toEqual([...Array(text.length + 1).keys()])
    })
  })

  describe("異常系", () => {
    it("対になっていないバッククォートは残す", () => {
      expect(buildSpeechText("a ` b").speechText).toBe("a ` b")
    })

    it("改行をまたぐバッククォートの組はインラインコードとみなさない（api のセグメント分割と同じ）", () => {
      expect(buildSpeechText("a `b\nc` d").speechText).toBe("a `b\nc` d")
    })

    it("空文字は番兵だけを持つ", () => {
      expect(buildSpeechText("")).toEqual({ sourceOffsets: [0], speechText: "" })
    })
  })
})

describe("mapSpeechRangeToSource", () => {
  describe("正常系", () => {
    it("インラインコードの中身の範囲は、開きのバッククォートの次から閉じのバッククォートの前まで", () => {
      const text = "Call `useEffect` here"
      const speech = buildSpeechText(text)

      const range = mapSpeechRangeToSource(speech, 5, 14)

      expect(range).toEqual({ endOffset: 15, startOffset: 6 })
      expect(text.slice(range.startOffset, range.endOffset)).toBe("useEffect")
    })

    it("インラインコードの外の範囲はそのままの位置", () => {
      const speech = buildSpeechText("Call `useEffect` here")

      expect(mapSpeechRangeToSource(speech, 0, 4)).toEqual({ endOffset: 4, startOffset: 0 })
      expect(mapSpeechRangeToSource(speech, 15, 19)).toEqual({ endOffset: 21, startOffset: 17 })
    })
  })

  describe("異常系", () => {
    it("空の範囲は endOffset = startOffset", () => {
      const speech = buildSpeechText("Call `useEffect` here")

      expect(mapSpeechRangeToSource(speech, 5, 5)).toEqual({ endOffset: 6, startOffset: 6 })
    })
  })
})
