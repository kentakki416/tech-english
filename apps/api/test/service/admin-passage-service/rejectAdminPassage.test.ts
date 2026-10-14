import type { PassageStatus } from "@repo/domain"

import { rejectAdminPassage } from "../../../src/service/admin-passage-service"
import { buildAdminPassageDetail, buildPassage } from "../../fixture/passage-content"

import { createMockPassageRepository } from "./fixtures"

const passageRepository = createMockPassageRepository()

const NOW = new Date("2026-10-13T09:00:00.000Z")

describe("rejectAdminPassage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passageRepository.transitionStatus.mockResolvedValue(true)
  })

  describe("正常系", () => {
    it("下書きを rejected にし、理由と reviewedAt を渡す（公開の条件を満たさない下書きも却下できる）", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ passage: buildPassage({ difficulty: null }) }))

      const result = await rejectAdminPassage(1, "目次だけの文書", NOW, { passageRepository })

      expect(result).toEqual({ ok: true, value: { id: 1, status: "rejected" } })
      expect(passageRepository.transitionStatus).toHaveBeenCalledWith(1, {
        from: ["draft"],
        rejectReason: "目次だけの文書",
        reviewedAt: NOW,
        to: "rejected",
      })
    })
  })

  describe("異常系", () => {
    it("存在しなければ 404 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(null)

      const result = await rejectAdminPassage(1, "理由", NOW, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })

    it.each<PassageStatus>(["collected", "generating", "published", "rejected", "failed"])("%s なら 409 を返す", async (status) => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ passage: buildPassage({ status }) }))

      const result = await rejectAdminPassage(1, "理由", NOW, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageRepository.transitionStatus).not.toHaveBeenCalled()
    })

    it("transitionStatus が false なら 409 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail())
      passageRepository.transitionStatus.mockResolvedValue(false)

      const result = await rejectAdminPassage(1, "理由", NOW, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
    })
  })
})
