import { PASSAGE_DIFFICULTIES, PASSAGE_STATUSES } from "../../src/const/passage"
import {
  calculateQuestionCount,
  calculateTimeLimitSeconds,
  isPassageDifficulty,
  isPassageStatus,
} from "../../src/rules/passage"

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

describe("calculateQuestionCount", () => {
  describe("正常系", () => {
    /**
     * 〜300 語: 3 問 / 301〜450 語: 4 問 / 451 語〜: 5 問 の境界の両側
     */
    it.each([
      [1, 3],
      [300, 3],
      [301, 4],
      [450, 4],
      [451, 5],
      [1200, 5],
    ])("%d 語は %d 問", (wordCount, expected) => {
      expect(calculateQuestionCount(wordCount)).toBe(expected)
    })
  })
})

describe("calculateTimeLimitSeconds", () => {
  describe("正常系", () => {
    it("難易度 2・400 語・4 問は 360 秒（README の例。ちょうど 30 の倍数は切り上げない）", () => {
      /**
       * 400 ÷ 120 × 60 = 200 秒 + 4 × 40 = 160 秒
       */
      expect(calculateTimeLimitSeconds(400, 2, 4)).toBe(360)
    })

    it("難易度 2・332 語・4 問は 326 秒を切り上げて 330 秒", () => {
      /**
       * 332 ÷ 120 × 60 = 166 秒 + 160 秒
       */
      expect(calculateTimeLimitSeconds(332, 2, 4)).toBe(330)
    })

    it("30 秒単位ちょうど（330 秒）は切り上げず、1 秒でも超えたら（331 秒）次の 30 秒に切り上げる", () => {
      /**
       * 340 語 → 170 秒 + 160 秒 = 330 秒 / 342 語 → 171 秒 + 160 秒 = 331 秒
       */
      expect(calculateTimeLimitSeconds(340, 2, 4)).toBe(330)
      expect(calculateTimeLimitSeconds(342, 2, 4)).toBe(360)
    })

    it("30 秒単位を 1 秒未満だけ超えても次の 30 秒に切り上げる", () => {
      /**
       * 難易度 3（140 WPM）・141 語・0 問 → 141 ÷ 140 × 60 = 60.43 秒
       */
      expect(calculateTimeLimitSeconds(141, 3, 0)).toBe(90)
      expect(calculateTimeLimitSeconds(140, 3, 0)).toBe(60)
    })

    it.each([
      /**
       * 700 ÷ 100 × 60 = 420 秒 + 200 秒 = 620 秒
       */
      [1, 630],
      /**
       * 700 ÷ 120 × 60 = 350 秒 + 200 秒 = 550 秒
       */
      [2, 570],
      /**
       * 700 ÷ 140 × 60 = 300 秒 + 200 秒 = 500 秒
       */
      [3, 510],
    ] as const)("難易度 %d の想定 WPM で計算する（700 語・5 問 → %d 秒）", (difficulty, expected) => {
      expect(calculateTimeLimitSeconds(700, difficulty, 5)).toBe(expected)
    })
  })
})
