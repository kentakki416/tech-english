import type { AudioStatus } from "@repo/domain"

import { retryAdminPassageAudio } from "../../../src/service/admin-passage-service"
import { buildPassageAudio } from "../../fixture/passage-audio"

import { createMockPassageAudioRepository } from "./fixtures"

const passageAudioRepository = createMockPassageAudioRepository()

const PUBLISHED_PASSAGE = { publishedAt: new Date("2026-10-12T03:00:00.000Z"), status: "published" as const }

describe("retryAdminPassageAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passageAudioRepository.resetFailed.mockResolvedValue(true)
  })

  describe("正常系", () => {
    it("failed の音声を pending に戻す", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue({
        audio: buildPassageAudio({ attemptCount: 3, lastError: "ServiceFailureException", status: "failed" }),
        passage: PUBLISHED_PASSAGE,
      })

      const result = await retryAdminPassageAudio(1, { passageAudioRepository })

      expect(result).toEqual({ ok: true, value: { passageId: 1, status: "pending" } })
      expect(passageAudioRepository.findByPassageId).toHaveBeenCalledWith(1)
      expect(passageAudioRepository.resetFailed).toHaveBeenCalledWith(1)
    })

    it("非公開に戻した問題の failed の音声も pending に戻す（作り直すのは再公開の後）", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue({
        audio: buildPassageAudio({ attemptCount: 3, lastError: "ServiceFailureException", status: "failed" }),
        passage: { ...PUBLISHED_PASSAGE, status: "draft" },
      })

      const result = await retryAdminPassageAudio(1, { passageAudioRepository })

      expect(result).toEqual({ ok: true, value: { passageId: 1, status: "pending" } })
      expect(passageAudioRepository.resetFailed).toHaveBeenCalledWith(1)
    })
  })

  describe("異常系", () => {
    it("問題が無ければ 404 を返し、更新しない", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue(null)

      const result = await retryAdminPassageAudio(1, { passageAudioRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
      expect(passageAudioRepository.resetFailed).not.toHaveBeenCalled()
    })

    it("音声の行が無ければ 409 を返し、更新しない", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue({ audio: null, passage: PUBLISHED_PASSAGE })

      const result = await retryAdminPassageAudio(1, { passageAudioRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageAudioRepository.resetFailed).not.toHaveBeenCalled()
    })

    it.each<AudioStatus>(["pending", "generating", "ready"])("%s なら 409 を返し、更新しない", async (status) => {
      passageAudioRepository.findByPassageId.mockResolvedValue({
        audio: buildPassageAudio({ status }),
        passage: PUBLISHED_PASSAGE,
      })

      const result = await retryAdminPassageAudio(1, { passageAudioRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageAudioRepository.resetFailed).not.toHaveBeenCalled()
    })

    it("resetFailed が false（検査の後に状態が変わった）なら 409 を返す", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue({
        audio: buildPassageAudio({ status: "failed" }),
        passage: PUBLISHED_PASSAGE,
      })
      passageAudioRepository.resetFailed.mockResolvedValue(false)

      const result = await retryAdminPassageAudio(1, { passageAudioRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
    })
  })
})
