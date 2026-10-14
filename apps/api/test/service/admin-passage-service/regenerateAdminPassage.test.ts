import type { PassageStatus } from "@repo/domain"

import { regenerateAdminPassage } from "../../../src/service/admin-passage-service"
import { buildAdminPassageDetail, buildPassage } from "../../fixture/passage-content"

import { createMockPassageRepository } from "./fixtures"

const passageRepository = createMockPassageRepository()

describe("regenerateAdminPassage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passageRepository.resetForRegeneration.mockResolvedValue(true)
  })

  describe("正常系", () => {
    it.each<PassageStatus>(["draft", "rejected", "failed"])("%s の問題を collected に戻す", async (status) => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ passage: buildPassage({ status }) }))

      const result = await regenerateAdminPassage(1, { passageRepository })

      expect(result).toEqual({ ok: true, value: { id: 1, status: "collected" } })
      expect(passageRepository.resetForRegeneration).toHaveBeenCalledWith(1, ["draft", "rejected", "failed"])
    })
  })

  describe("異常系", () => {
    it("存在しなければ 404 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(null)

      const result = await regenerateAdminPassage(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })

    it.each<PassageStatus>(["collected", "generating", "published"])("%s なら 409 を返す", async (status) => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ passage: buildPassage({ status }) }))

      const result = await regenerateAdminPassage(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageRepository.resetForRegeneration).not.toHaveBeenCalled()
    })

    it("挑戦が 1 件でもあれば 409 を返す（境界値）", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ attemptCount: 1 }))

      const result = await regenerateAdminPassage(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageRepository.resetForRegeneration).not.toHaveBeenCalled()
    })

    it("resetForRegeneration が false（検査の後に状態が変わった・挑戦が始まった）なら 409 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail())
      passageRepository.resetForRegeneration.mockResolvedValue(false)

      const result = await regenerateAdminPassage(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
    })
  })
})
