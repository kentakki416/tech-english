import { isAudioStorageAllowed } from "../../../src/lib/audio"

describe("isAudioStorageAllowed", () => {
  describe("正常系", () => {
    it("production の s3 は使える", () => {
      expect(isAudioStorageAllowed({ nodeEnv: "production", storageType: "s3" })).toBe(true)
    })

    it.each(["development", "test"])("%s は local も s3 も使える", (nodeEnv) => {
      expect(isAudioStorageAllowed({ nodeEnv, storageType: "local" })).toBe(true)
      expect(isAudioStorageAllowed({ nodeEnv, storageType: "s3" })).toBe(true)
    })
  })

  describe("異常系", () => {
    it("production の local（コンテナの一時領域）は使えない", () => {
      expect(isAudioStorageAllowed({ nodeEnv: "production", storageType: "local" })).toBe(false)
    })
  })
})
