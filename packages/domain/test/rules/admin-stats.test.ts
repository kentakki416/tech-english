import { findMisleadingChoiceIndexes, isQuestionNeedingReview } from "../../src/rules/admin-stats"

describe("isQuestionNeedingReview", () => {
  describe("正常系", () => {
    it("正解でない選択肢が正解より多く選ばれていれば true", () => {
      expect(isQuestionNeedingReview({ answerCount: 10, choiceCounts: [5, 3, 1, 1], correctChoiceIndex: 1 })).toBe(true)
    })

    it("正解と同数の選択肢があれば true", () => {
      expect(isQuestionNeedingReview({ answerCount: 6, choiceCounts: [3, 3, 0, 0], correctChoiceIndex: 1 })).toBe(true)
    })

    it("正解が最も多く選ばれていれば false", () => {
      expect(isQuestionNeedingReview({ answerCount: 10, choiceCounts: [2, 6, 1, 1], correctChoiceIndex: 1 })).toBe(false)
    })
  })

  describe("異常系", () => {
    it("解答が 4 件なら判定しない（false）、5 件なら判定する", () => {
      expect(isQuestionNeedingReview({ answerCount: 4, choiceCounts: [4, 0, 0, 0], correctChoiceIndex: 1 })).toBe(false)
      expect(isQuestionNeedingReview({ answerCount: 5, choiceCounts: [5, 0, 0, 0], correctChoiceIndex: 1 })).toBe(true)
    })

    it("1 度も選ばれていない選択肢は、正解も 0 件（全員が未回答）でも true にしない", () => {
      expect(isQuestionNeedingReview({ answerCount: 5, choiceCounts: [0, 0, 0, 0], correctChoiceIndex: 1 })).toBe(false)
    })
  })
})

describe("findMisleadingChoiceIndexes", () => {
  describe("正常系", () => {
    it("正解と同じかそれ以上選ばれた誤りの番号を、選択肢の順に返す", () => {
      expect(findMisleadingChoiceIndexes({ answerCount: 10, choiceCounts: [4, 3, 3, 0], correctChoiceIndex: 1 })).toEqual([0, 2])
    })

    it("正解が最も多く選ばれていれば空", () => {
      expect(findMisleadingChoiceIndexes({ answerCount: 10, choiceCounts: [2, 6, 1, 1], correctChoiceIndex: 1 })).toEqual([])
    })
  })

  describe("異常系", () => {
    it("解答が 4 件なら空、5 件なら返す", () => {
      expect(findMisleadingChoiceIndexes({ answerCount: 4, choiceCounts: [4, 0, 0, 0], correctChoiceIndex: 1 })).toEqual([])
      expect(findMisleadingChoiceIndexes({ answerCount: 5, choiceCounts: [5, 0, 0, 0], correctChoiceIndex: 1 })).toEqual([0])
    })

    it("1 度も選ばれていない選択肢は、正解も 0 件でも返さない", () => {
      expect(findMisleadingChoiceIndexes({ answerCount: 5, choiceCounts: [0, 0, 0, 0], correctChoiceIndex: 1 })).toEqual([])
    })
  })
})
