import { convertAdminPassageDetailToResponse } from "../../../../src/controller/admin/passage/convert-detail-to-response"
import { buildAdminPassageDetail, buildPassage } from "../../../fixture/passage-content"

/**
 * DB を使わない変換のユニットテスト（レスポンス全体の形は detail.test.ts のインテグレーションテストで見る）
 */
describe("convertAdminPassageDetailToResponse", () => {
  describe("正常系", () => {
    it.each([
      [300, 3],
      [301, 4],
      [450, 4],
      [451, 5],
    ])("英単語数 %i 語なら recommended_question_count は %i（domain の calculateQuestionCount。境界値）", (wordCount, expected) => {
      const detail = buildAdminPassageDetail({ passage: buildPassage({ wordCount }) })

      expect(convertAdminPassageDetailToResponse(detail).recommended_question_count).toBe(expected)
    })
  })
})
