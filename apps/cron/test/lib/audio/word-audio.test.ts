import { buildWordAudioKey, calculateWordTextHash } from "../../../src/lib/audio"

describe("calculateWordTextHash", () => {
  describe("正常系", () => {
    it("同じ voice と見出し語なら同じ値（SHA-256 の 16 進）", () => {
      const hash = calculateWordTextHash({ lemma: "escape hatch", voiceId: "Joanna" })

      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      expect(calculateWordTextHash({ lemma: "escape hatch", voiceId: "Joanna" })).toBe(hash)
    })

    it("voice か見出し語が違えば違う値（voice を変えると保存キーも変わる）", () => {
      const hash = calculateWordTextHash({ lemma: "cache", voiceId: "Joanna" })

      expect(calculateWordTextHash({ lemma: "cache", voiceId: "Matthew" })).not.toBe(hash)
      expect(calculateWordTextHash({ lemma: "cache", voiceId: "fake:Joanna" })).not.toBe(hash)
      expect(calculateWordTextHash({ lemma: "queue", voiceId: "Joanna" })).not.toBe(hash)
    })
  })

  describe("異常系", () => {
    it("voice と見出し語の区切りがずれても同じ値にならない（改行で区切る）", () => {
      expect(calculateWordTextHash({ lemma: "b", voiceId: "a" })).not.toBe(calculateWordTextHash({ lemma: "", voiceId: "a\nb" }))
    })
  })
})

describe("buildWordAudioKey", () => {
  describe("正常系", () => {
    it("words/{text_hash}.mp3", () => {
      expect(buildWordAudioKey("abc123")).toBe("words/abc123.mp3")
    })
  })
})
