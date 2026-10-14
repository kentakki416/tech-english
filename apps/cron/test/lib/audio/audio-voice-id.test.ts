import type { PassageBlock } from "@repo/domain"

import { buildAudioVoiceId, calculateAudioTextHash } from "../../../src/lib/audio"

describe("buildAudioVoiceId", () => {
  describe("正常系", () => {
    it("polly は TTS_VOICE_ID のまま", () => {
      expect(buildAudioVoiceId({ provider: "polly", voiceId: "Joanna" })).toBe("Joanna")
    })

    it("fake は fake:<voice>", () => {
      expect(buildAudioVoiceId({ provider: "fake", voiceId: "Joanna" })).toBe("fake:Joanna")
    })

    it("fake と polly で text_hash（保存キー）が変わる", () => {
      const blocks: PassageBlock[] = [{ text: "Effects are an escape hatch.", type: "paragraph" }]

      const fakeHash = calculateAudioTextHash({ blocks, voiceId: buildAudioVoiceId({ provider: "fake", voiceId: "Joanna" }) })
      const pollyHash = calculateAudioTextHash({ blocks, voiceId: buildAudioVoiceId({ provider: "polly", voiceId: "Joanna" }) })

      expect(fakeHash).not.toBe(pollyHash)
    })
  })
})
