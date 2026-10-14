import { PASSAGE_DIFFICULTIES, PASSAGE_STATUSES } from "../../src/const/passage"
import { isPassageDifficulty, isPassageStatus } from "../../src/rules/passage"

describe("isPassageStatus", () => {
  describe("正常系", () => {
    it.each(PASSAGE_STATUSES)("%s は状態の値である", (value) => {
      expect(isPassageStatus(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "pending", "Published", "deleted"])("%j は状態の値ではない", (value) => {
      expect(isPassageStatus(value)).toBe(false)
    })
  })
})

describe("isPassageDifficulty", () => {
  describe("正常系", () => {
    it.each(PASSAGE_DIFFICULTIES)("%d は難易度の値である", (value) => {
      expect(isPassageDifficulty(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    /**
     * 範囲の外（0 と 4）と、範囲内でも整数でない値
     */
    it.each([0, 4, -1, 1.5, Number.NaN])("%d は難易度の値ではない", (value) => {
      expect(isPassageDifficulty(value)).toBe(false)
    })
  })
})
