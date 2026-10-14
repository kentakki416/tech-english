import { parseGenerateQuestionsArgs } from "../../../src/lib/question-generation"

describe("parseGenerateQuestionsArgs", () => {
  describe("正常系", () => {
    it("--passage-id=42 を数値で返す", () => {
      expect(parseGenerateQuestionsArgs(["--passage-id=42"])).toEqual({ passageId: 42 })
    })

    it("--passage-id 42（空白区切り）も読む", () => {
      expect(parseGenerateQuestionsArgs(["--passage-id", "42"])).toEqual({ passageId: 42 })
    })

    it("指定が無ければ passageId は undefined", () => {
      expect(parseGenerateQuestionsArgs([]).passageId).toBeUndefined()
    })
  })

  describe("異常系", () => {
    it.each(["abc", "0", "-1", "1.5", "1e3", "0x10", "", "2147483648"])("--passage-id=%s は throw する", (value) => {
      expect(() => parseGenerateQuestionsArgs([`--passage-id=${value}`])).toThrow("--passage-id must be a positive integer")
    })

    it("未知のフラグ・位置引数は throw する", () => {
      expect(() => parseGenerateQuestionsArgs(["--dry-run"])).toThrow()
      expect(() => parseGenerateQuestionsArgs(["42"])).toThrow()
    })
  })
})
