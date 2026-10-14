import type { PassageStatus } from "@repo/domain"

import { restoreAdminPassage } from "../../../src/service/admin-passage-service"
import { buildAdminPassageDetail, buildPassage } from "../../fixture/passage-content"

import { createMockPassageRepository } from "./fixtures"

const passageRepository = createMockPassageRepository()

describe("restoreAdminPassage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it.each(["draft", "collected"] as const)("却下した問題を restoreRejected が返した状態（%s）に戻す", async (status) => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({
        passage: buildPassage({ rejectReason: "不向き", status: "rejected" }),
      }))
      passageRepository.restoreRejected.mockResolvedValue(status)

      const result = await restoreAdminPassage(1, { passageRepository })

      expect(result).toEqual({ ok: true, value: { id: 1, status } })
      expect(passageRepository.restoreRejected).toHaveBeenCalledWith(1)
    })

    it("挑戦がある問題も取り消せる（設問を消さないため）", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({
        attemptCount: 2,
        passage: buildPassage({ status: "rejected" }),
      }))
      passageRepository.restoreRejected.mockResolvedValue("draft")

      const result = await restoreAdminPassage(1, { passageRepository })

      expect(result).toEqual({ ok: true, value: { id: 1, status: "draft" } })
    })
  })

  describe("異常系", () => {
    it("存在しなければ 404 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(null)

      const result = await restoreAdminPassage(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
      expect(passageRepository.restoreRejected).not.toHaveBeenCalled()
    })

    it.each<PassageStatus>(["collected", "generating", "draft", "published", "failed"])("%s なら 409 を返す", async (status) => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ passage: buildPassage({ status }) }))

      const result = await restoreAdminPassage(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageRepository.restoreRejected).not.toHaveBeenCalled()
    })

    it("restoreRejected が null（検査の後に状態が変わった）なら 409 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ passage: buildPassage({ status: "rejected" }) }))
      passageRepository.restoreRejected.mockResolvedValue(null)

      const result = await restoreAdminPassage(1, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
    })
  })
})
