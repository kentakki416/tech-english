import { FakeTtsClient } from "../../../src/client/polly"
import { forTesting } from "../../../src/client/polly/fake-tts-client"
import { measureMp3DurationMs } from "../../../src/lib/audio"

const { SILENT_FRAME_MS } = forTesting

/**
 * 課金されないので呼ばれない（呼ばれたらテストで分かるよう vi.fn にする）
 */
const recordBilledCharacters = vi.fn(async (_characters: number) => undefined)

describe("FakeTtsClient", () => {
  describe("正常系", () => {
    it("同じ入力には同じ結果を返し、課金文字数は 0 で recordBilledCharacters を呼ばない（月の上限に数えない）", async () => {
      const client = new FakeTtsClient()
      const input = { recordBilledCharacters, text: "Effects let you synchronize a component.", voiceId: "Joanna" }

      const first = await client.synthesize(input)
      const second = await client.synthesize(input)

      expect(second).toEqual(first)
      expect(first.billedCharacters).toBe(0)
      expect(recordBilledCharacters).not.toHaveBeenCalled()
    })

    it("単語の数だけ時刻があり、等間隔で音声の長さ未満", async () => {
      const result = await new FakeTtsClient().synthesize({ recordBilledCharacters, text: "Some components need to stay in sync.", voiceId: "Joanna" })
      const durationMs = measureMp3DurationMs(result.audio)

      expect(result.marks.map((mark) => mark.value)).toEqual(["Some", "components", "need", "to", "stay", "in", "sync"])
      expect(result.marks.map((mark) => mark.time)).toEqual(
        result.marks.map((_mark, index) => Math.floor((index * durationMs) / result.marks.length)),
      )
      expect(result.marks.every((mark) => mark.time < durationMs)).toBe(true)
    })

    it("音声は単語の数 × 300 ms 以上の無音の mp3 で、長さは frameCount × 36 ms", async () => {
      const result = await new FakeTtsClient().synthesize({ recordBilledCharacters, text: "one two three four five", voiceId: "Joanna" })

      const durationMs = measureMp3DurationMs(result.audio)

      expect(durationMs % SILENT_FRAME_MS).toBe(0)
      expect(durationMs).toBe(Math.ceil((5 * 300) / SILENT_FRAME_MS) * SILENT_FRAME_MS)
      expect(result.audio.length).toBe((durationMs / SILENT_FRAME_MS) * 144)
    })

    it("絵文字・全角記号を含むテキストでも start / end は UTF-8 のバイト位置", async () => {
      const text = "🚀 Ship it — café’s（任意）ready"

      const result = await new FakeTtsClient().synthesize({ recordBilledCharacters, text, voiceId: "Joanna" })

      const bytes = Buffer.from(text)
      expect(result.marks.map((mark) => bytes.subarray(mark.start, mark.end).toString())).toEqual(
        result.marks.map((mark) => mark.value),
      )
      expect(result.marks.map((mark) => mark.value)).toEqual(["Ship", "it", "caf", "s", "ready"])
    })
  })

  describe("異常系", () => {
    it("単語が無ければ時刻は空で、音声は 1 フレーム", async () => {
      const result = await new FakeTtsClient().synthesize({ recordBilledCharacters, text: "— …", voiceId: "Joanna" })

      expect(result.marks).toEqual([])
      expect(measureMp3DurationMs(result.audio)).toBe(SILENT_FRAME_MS)
    })
  })
})
