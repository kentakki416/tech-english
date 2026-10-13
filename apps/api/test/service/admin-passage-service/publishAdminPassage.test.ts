import type { PassageStatus } from "@repo/domain"

import { publishAdminPassage } from "../../../src/service/admin-passage-service"
import { buildAdminPassageDetail, buildPassage } from "../../fixture/passage-content"

import { createMockPassageRepository } from "./fixtures"

const passageRepository = createMockPassageRepository()

const NOW = new Date("2026-10-13T09:00:00.000Z")

describe("publishAdminPassage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passageRepository.transitionStatus.mockResolvedValue(true)
  })

  describe("正常系", () => {
    it("公開の条件を満たす下書きを published にし、publishedAt / reviewedAt に now を渡す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail())

      const result = await publishAdminPassage(1, NOW, { passageRepository })

      expect(result).toEqual({ ok: true, value: { id: 1, status: "published" } })
      expect(passageRepository.transitionStatus).toHaveBeenCalledWith(1, {
        from: ["draft"],
        publishedAt: NOW,
        reviewedAt: NOW,
        to: "published",
      })
    })
  })

  describe("異常系", () => {
    it("存在しなければ 404 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(null)

      const result = await publishAdminPassage(1, NOW, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })

    it.each<PassageStatus>(["collected", "generating", "published", "rejected", "failed"])("%s なら 409 を返す", async (status) => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ passage: buildPassage({ status }) }))

      const result = await publishAdminPassage(1, NOW, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageRepository.transitionStatus).not.toHaveBeenCalled()
    })

    it("公開の条件を満たさなければ 400 と details を返し、遷移しない", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({
        passage: buildPassage({ difficulty: null, timeLimitSeconds: null }),
      }))

      const result = await publishAdminPassage(1, NOW, { passageRepository })

      expect(result).toEqual({
        error: {
          details: [
            { code: "difficulty_missing", message: expect.any(String), path: ["difficulty"] },
            { code: "time_limit_missing", message: expect.any(String), path: ["time_limit_seconds"] },
          ],
          message: expect.any(String),
          statusCode: 400,
          type: "BAD_REQUEST",
        },
        ok: false,
      })
      expect(passageRepository.transitionStatus).not.toHaveBeenCalled()
    })

    it("transitionStatus が false（検査の後に状態が変わった）なら 409 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail())
      passageRepository.transitionStatus.mockResolvedValue(false)

      const result = await publishAdminPassage(1, NOW, { passageRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
    })
  })
})
