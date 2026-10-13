import { getAdminPassageDetail } from "../../../src/service/admin-passage-service"
import { buildAdminPassageDetail } from "../../fixture/passage-content"

import { createMockPassageRepository } from "./fixtures"

const passageRepository = createMockPassageRepository()

describe("getAdminPassageDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("findAdminDetail の結果を返す", async () => {
      const detail = buildAdminPassageDetail()
      passageRepository.findAdminDetail.mockResolvedValue(detail)

      const result = await getAdminPassageDetail(1, { passageRepository })

      expect(result).toEqual({ ok: true, value: detail })
      expect(passageRepository.findAdminDetail).toHaveBeenCalledWith(1)
    })
  })

  describe("異常系", () => {
    it("存在しなければ 404 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(null)

      const result = await getAdminPassageDetail(999, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })
  })
})
