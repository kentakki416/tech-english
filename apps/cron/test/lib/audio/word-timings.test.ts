import {
  buildSpeechText,
  convertSpeechMarksToWordTimings,
  type SpeechMark,
  type SpeechPart,
  splitSpeechText,
} from "../../../src/lib/audio"

const WORD_PATTERN = /[A-Za-z0-9]+/g

/**
 * Polly と同じ形の Speech Marks（start / end はパートのテキストの UTF-8 のバイト位置）を、パートの単語から作る
 */
const buildMarks = (part: SpeechPart, msPerWord = 250): SpeechMark[] =>
  [...part.text.matchAll(WORD_PATTERN)].map((match, index) => {
    const start = Buffer.byteLength(part.text.slice(0, match.index))
    return { end: start + Buffer.byteLength(match[0]), start, time: index * msPerWord, value: match[0] }
  })

describe("convertSpeechMarksToWordTimings", () => {
  describe("正常系", () => {
    it("絵文字・全角記号・インラインコードを含む本文で、すべての単語の位置が元の本文のその単語を指す", () => {
      const text = "🚀 Run `npm install` — then `cd app`（任意）. Done"
      const speech = buildSpeechText(text)
      const [part] = splitSpeechText(speech.speechText, 3000)
      if (!part) throw new Error("no part")
      const marks = buildMarks(part)

      const words = convertSpeechMarksToWordTimings({ durationMs: 5000, marks, part, speech })

      expect(words.map(([, , startOffset, endOffset]) => text.slice(startOffset, endOffset))).toEqual(
        marks.map((mark) => mark.value),
      )
      const npm = words[1]
      const install = words[2]
      /**
       * npm は開きのバッククォートの次から始まり、install は閉じのバッククォートを含まない
       */
      expect(npm?.[2]).toBe(text.indexOf("`npm") + 1)
      expect(install?.[3]).toBe(text.indexOf("install`") + "install".length)
      expect(text[install?.[3] ?? -1]).toBe("`")
    })

    it("endMs は次の単語の time、最後の単語はパートの durationMs", () => {
      const speech = buildSpeechText("Effects run later")
      const part: SpeechPart = { start: 0, text: "Effects run later" }

      const words = convertSpeechMarksToWordTimings({
        durationMs: 1800,
        marks: [
          { end: 7, start: 0, time: 6, value: "Effects" },
          { end: 11, start: 8, time: 620, value: "run" },
          { end: 17, start: 12, time: 1040, value: "later" },
        ],
        part,
        speech,
      })

      expect(words).toEqual([
        [6, 620, 0, 7],
        [620, 1040, 8, 11],
        [1040, 1800, 12, 17],
      ])
    })

    it("2 つめのパートの単語は part.start の分ずれた位置になる", () => {
      const text = "First `one` here. Second `two` there."
      const speech = buildSpeechText(text)
      const parts = splitSpeechText(speech.speechText, 20)
      const second = parts[1]
      if (!second) throw new Error("no second part")

      const words = convertSpeechMarksToWordTimings({ durationMs: 900, marks: buildMarks(second), part: second, speech })

      expect(second.start).toBeGreaterThan(0)
      expect(words.map(([, , startOffset, endOffset]) => text.slice(startOffset, endOffset))).toEqual(["Second", "two", "there"])
    })
  })

  describe("異常系", () => {
    it("範囲が空になった単語は捨て、前の単語の endMs は次に残った単語の time にする", () => {
      const speech = buildSpeechText("a b")
      const part: SpeechPart = { start: 0, text: "a b" }

      const words = convertSpeechMarksToWordTimings({
        durationMs: 900,
        marks: [
          { end: 1, start: 0, time: 0, value: "a" },
          { end: 2, start: 2, time: 300, value: "" },
          { end: 3, start: 2, time: 600, value: "b" },
        ],
        part,
        speech,
      })

      expect(words).toEqual([
        [0, 600, 0, 1],
        [600, 900, 2, 3],
      ])
    })

    it("バイト位置がテキストの外なら端に丸める", () => {
      const speech = buildSpeechText("ok")
      const part: SpeechPart = { start: 0, text: "ok" }

      const words = convertSpeechMarksToWordTimings({
        durationMs: 300,
        marks: [{ end: 99, start: 0, time: 0, value: "ok" }],
        part,
        speech,
      })

      expect(words).toEqual([[0, 300, 0, 2]])
    })
  })
})
