import { shuffleChoices } from "../../../src/lib/question-generation"

import { createSequenceRandom } from "./helpers"

const CHOICES = ["alpha", "bravo", "charlie", "delta"]

/**
 * CHOICES[i] の和訳（並べ替えた後も同じ位置の英文と組になっているかを確かめる）
 */
const CHOICES_JA = ["アルファ", "ブラボー", "チャーリー", "デルタ"]

describe("shuffleChoices", () => {
  describe("正常系", () => {
    it("固定した random で並びが変わり、正解の選択肢の文字列が correctChoiceIndex の位置にある", () => {
      /**
       * random が常に 0 なら、末尾から順に先頭と入れ替わる（[0,1,2,3] → [3,1,2,0] → [2,1,3,0] → [1,2,3,0]）
       */
      const result = shuffleChoices({ choices: CHOICES, choicesJa: CHOICES_JA, correctChoiceIndex: 0 }, () => 0)

      expect(result).toEqual({
        choices: ["bravo", "charlie", "delta", "alpha"],
        choicesJa: ["ブラボー", "チャーリー", "デルタ", "アルファ"],
        correctChoiceIndex: 3,
      })
      expect(result.choices[result.correctChoiceIndex]).toBe("alpha")
    })

    it("random が 1 に近ければ入れ替えない", () => {
      const result = shuffleChoices({ choices: CHOICES, choicesJa: CHOICES_JA, correctChoiceIndex: 2 }, () => 0.999)

      expect(result).toEqual({ choices: CHOICES, choicesJa: CHOICES_JA, correctChoiceIndex: 2 })
    })

    it.each([
      [[0.1, 0.7, 0.4]],
      [[0.9, 0.2, 0.5]],
      [[0.5, 0.5, 0.5]],
    ])("どの乱数でも選択肢の集合は変わらず、正解の文字列を指し続け、和訳は同じ位置の英文と組のまま（random: %j）", (values) => {
      CHOICES.forEach((correctChoice, correctChoiceIndex) => {
        const result = shuffleChoices({ choices: CHOICES, choicesJa: CHOICES_JA, correctChoiceIndex }, createSequenceRandom(values))

        expect([...result.choices].sort()).toEqual([...CHOICES].sort())
        expect(result.choices[result.correctChoiceIndex]).toBe(correctChoice)
        expect(result.choicesJa).toEqual(result.choices.map((choice) => CHOICES_JA[CHOICES.indexOf(choice)]))
      })
    })

    it("和訳が null なら null のまま並べ替える", () => {
      const result = shuffleChoices({ choices: CHOICES, choicesJa: null, correctChoiceIndex: 0 }, () => 0)

      expect(result).toEqual({ choices: ["bravo", "charlie", "delta", "alpha"], choicesJa: null, correctChoiceIndex: 3 })
    })

    it("引数の配列は変えない", () => {
      const choices = [...CHOICES]
      const choicesJa = [...CHOICES_JA]

      shuffleChoices({ choices, choicesJa, correctChoiceIndex: 1 }, () => 0)

      expect(choices).toEqual(CHOICES)
      expect(choicesJa).toEqual(CHOICES_JA)
    })
  })
})
