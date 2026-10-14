import { resolveAdminPassageAttention } from "../../../src/service/admin-passage-service"

import { createMockPassageRepository } from "./fixtures"

const passageRepository = createMockPassageRepository()

describe("resolveAdminPassageAttention", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("clearAttention を呼び、要確認を外した結果を返す（状態を確かめずに呼ぶ）", async () => {
      passageRepository.clearAttention.mockResolvedValue(true)

      const result = await resolveAdminPassageAttention(1, { passageRepository })

      expect(result).toEqual({ ok: true, value: { id: 1, attentionReasons: [], needsAttention: false } })
      expect(passageRepository.clearAttention).toHaveBeenCalledWith(1)
      expect(passageRepository.findAdminDetail).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("行が無ければ（clearAttention が false）404 を返す", async () => {
      passageRepository.clearAttention.mockResolvedValue(false)

      const result = await resolveAdminPassageAttention(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })
  })
})
