import { ATTEMPT_STATUSES, WORD_LOOKUP_SOURCES } from "../../src/const/attempt"
import { isAttemptStatus, isWordLookupSource } from "../../src/rules/attempt"

describe("isAttemptStatus", () => {
  describe("正常系", () => {
    it.each(ATTEMPT_STATUSES)("%s は挑戦の状態の値である", (value) => {
      expect(isAttemptStatus(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "started", "Submitted", "in-progress"])("%j は挑戦の状態の値ではない", (value) => {
      expect(isAttemptStatus(value)).toBe(false)
    })
  })
})

describe("isWordLookupSource", () => {
  describe("正常系", () => {
    it.each(WORD_LOOKUP_SOURCES)("%s は調べた単語の出どころの値である", (value) => {
      expect(isWordLookupSource(value)).toBe(true)
    })
  })

  describe("異常系", () => {
    it.each(["", "llm", "Glossary"])("%j は調べた単語の出どころの値ではない", (value) => {
      expect(isWordLookupSource(value)).toBe(false)
    })
  })
})
