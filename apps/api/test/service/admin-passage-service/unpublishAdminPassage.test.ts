import type { PassageStatus } from "@repo/domain"

import { unpublishAdminPassage } from "../../../src/service/admin-passage-service"
import { buildAdminPassageDetail, buildPassage } from "../../fixture/passage-content"

import { createMockPassageRepository } from "./fixtures"

const passageRepository = createMockPassageRepository()

describe("unpublishAdminPassage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passageRepository.transitionStatus.mockResolvedValue(true)
  })

  describe("正常系", () => {
    it("公開中の問題を draft に戻す（publishedAt は渡さない）", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({
        passage: buildPassage({ publishedAt: new Date("2026-10-12T00:00:00.000Z"), status: "published" }),
      }))

      const result = await unpublishAdminPassage(1, { passageRepository })

      expect(result).toEqual({ ok: true, value: { id: 1, status: "draft" } })
      expect(passageRepository.transitionStatus).toHaveBeenCalledWith(1, { from: ["published"], to: "draft" })
    })
  })

  describe("異常系", () => {
    it("存在しなければ 404 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(null)

      const result = await unpublishAdminPassage(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })

    it.each<PassageStatus>(["collected", "generating", "draft", "rejected", "failed"])("%s なら 409 を返す", async (status) => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ passage: buildPassage({ status }) }))

      const result = await unpublishAdminPassage(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageRepository.transitionStatus).not.toHaveBeenCalled()
    })

    it("transitionStatus が false なら 409 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ passage: buildPassage({ status: "published" }) }))
      passageRepository.transitionStatus.mockResolvedValue(false)

      const result = await unpublishAdminPassage(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
    })
  })
})
