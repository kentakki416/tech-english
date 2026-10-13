import { QUESTION_TYPES } from "../../src/const/question"
import { isQuestionType } from "../../src/rules/question"

describe("isQuestionType", () => {
  describe("正常系", () => {
    it.each(QUESTION_TYPES)("%s は設問の種類の値である", (value) => {
      expect(isQuestionType(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "summary", "Detail", "main-idea"])("%j は設問の種類の値ではない", (value) => {
      expect(isQuestionType(value)).toBe(false)
    })
  })
})
