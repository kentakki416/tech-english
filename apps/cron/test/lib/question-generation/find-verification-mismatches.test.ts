import { findVerificationMismatches } from "../../../src/lib/question-generation"

const QUESTIONS = [{ correctChoiceIndex: 0 }, { correctChoiceIndex: 1 }, { correctChoiceIndex: 3 }]

describe("findVerificationMismatches", () => {
  describe("正常系", () => {
    it("全問が正解と一致すれば理由は無く、検証モデルの回答を設問の順に返す", () => {
      const result = findVerificationMismatches(QUESTIONS, [
        { choiceIndex: 0, questionNumber: 1 },
        { choiceIndex: 1, questionNumber: 2 },
        { choiceIndex: 3, questionNumber: 3 },
      ])

      expect(result).toEqual({ attentionReasons: [], verificationChoiceIndexes: [0, 1, 3] })
    })

    it("食い違った設問だけ理由を付ける（記号は A〜D）", () => {
      const result = findVerificationMismatches(QUESTIONS, [
        { choiceIndex: 0, questionNumber: 1 },
        { choiceIndex: 2, questionNumber: 2 },
        { choiceIndex: 0, questionNumber: 3 },
      ])

      expect(result).toEqual({
        attentionReasons: ["Q2：検証モデルは C を選択（正解は B）", "Q3：検証モデルは A を選択（正解は D）"],
        verificationChoiceIndexes: [0, 2, 0],
      })
    })

    it("回答の並び順ではなく questionNumber で設問に対応させる", () => {
      const result = findVerificationMismatches(QUESTIONS, [
        { choiceIndex: 3, questionNumber: 3 },
        { choiceIndex: 0, questionNumber: 1 },
        { choiceIndex: 1, questionNumber: 2 },
      ])

      expect(result.verificationChoiceIndexes).toEqual([0, 1, 3])
    })
  })

  describe("異常系", () => {
    it("回答の無い設問は null（理由は付けない）", () => {
      const result = findVerificationMismatches(QUESTIONS, [{ choiceIndex: 0, questionNumber: 1 }])

      expect(result).toEqual({ attentionReasons: [], verificationChoiceIndexes: [0, null, null] })
    })
  })
})
