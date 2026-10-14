import { AUDIO_STATUSES } from "../../src/const/audio"
import { isAudioStatus } from "../../src/rules/audio"

describe("isAudioStatus", () => {
  describe("正常系", () => {
    it.each(AUDIO_STATUSES)("%s は音声の状態の値である", (value) => {
      expect(isAudioStatus(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "collected", "Ready", "published"])("%j は音声の状態の値ではない", (value) => {
      expect(isAudioStatus(value)).toBe(false)
    })
  })
})
