import { shuffleChoices } from "../../../src/lib/question-generation"

import { createSequenceRandom } from "./helpers"

const CHOICES = ["alpha", "bravo", "charlie", "delta"]

describe("shuffleChoices", () => {
  describe("正常系", () => {
    it("固定した random で並びが変わり、正解の選択肢の文字列が correctChoiceIndex の位置にある", () => {
      /**
       * random が常に 0 なら、末尾から順に先頭と入れ替わる（[0,1,2,3] → [3,1,2,0] → [2,1,3,0] → [1,2,3,0]）
       */
      const result = shuffleChoices(CHOICES, 0, () => 0)

      expect(result).toEqual({ choices: ["bravo", "charlie", "delta", "alpha"], correctChoiceIndex: 3 })
      expect(result.choices[result.correctChoiceIndex]).toBe("alpha")
    })

    it("random が 1 に近ければ入れ替えない", () => {
      const result = shuffleChoices(CHOICES, 2, () => 0.999)

      expect(result).toEqual({ choices: CHOICES, correctChoiceIndex: 2 })
    })

    it.each([
      [[0.1, 0.7, 0.4]],
      [[0.9, 0.2, 0.5]],
      [[0.5, 0.5, 0.5]],
    ])("どの乱数でも選択肢の集合は変わらず、正解の文字列を指し続ける（random: %j）", (values) => {
      CHOICES.forEach((correctChoice, correctChoiceIndex) => {
        const result = shuffleChoices(CHOICES, correctChoiceIndex, createSequenceRandom(values))

        expect([...result.choices].sort()).toEqual([...CHOICES].sort())
        expect(result.choices[result.correctChoiceIndex]).toBe(correctChoice)
      })
    })

    it("引数の配列は変えない", () => {
      const choices = [...CHOICES]

      shuffleChoices(choices, 1, () => 0)

      expect(choices).toEqual(CHOICES)
    })
  })
})
