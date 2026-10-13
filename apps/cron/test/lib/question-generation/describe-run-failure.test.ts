import { describeRunFailure, type GenerateQuestionsRunCounts } from "../../../src/lib/question-generation"

const buildCounts = (overrides: Partial<GenerateQuestionsRunCounts> = {}): GenerateQuestionsRunCounts => ({
  draftCount: 0,
  failedCount: 0,
  rejectedCount: 0,
  retryLaterCount: 0,
  ...overrides,
})

describe("describeRunFailure", () => {
  describe("正常系", () => {
    it.each([
      ["何も取得しなかった", {}],
      ["全件が下書きになった", { draftCount: 3 }],
      ["一部が失敗しても下書きが 1 件ある", { draftCount: 1, retryLaterCount: 2 }],
      ["一部が失敗しても却下が 1 件ある", { rejectedCount: 1, retryLaterCount: 2 }],
    ])("%sなら null（exit 0）", (_label, overrides) => {
      expect(describeRunFailure(buildCounts(overrides))).toBeNull()
    })
  })

  describe("異常系", () => {
    it("failed が 1 件でもあれば、他が下書きになっていても理由を返す", () => {
      expect(describeRunFailure(buildCounts({ draftCount: 2, failedCount: 1 })))
        .toBe("generate-questions: 1 passage(s) reached the attempt limit and were marked as failed")
    })

    it("取得した全件が一時的な失敗で collected に戻ったら理由を返す", () => {
      expect(describeRunFailure(buildCounts({ retryLaterCount: 3 })))
        .toBe("generate-questions: no passage was generated; 3 passage(s) failed and were returned to collected")
    })

    it("failed と全件の失敗が重なれば、両方の理由を返す", () => {
      expect(describeRunFailure(buildCounts({ failedCount: 1, retryLaterCount: 2 }))).toBe(
        "generate-questions: 1 passage(s) reached the attempt limit and were marked as failed; "
        + "no passage was generated; 2 passage(s) failed and were returned to collected",
      )
    })
  })
})
