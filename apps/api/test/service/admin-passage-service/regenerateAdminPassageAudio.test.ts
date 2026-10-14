import type { AudioStatus } from "@repo/domain"

import { regenerateAdminPassageAudio } from "../../../src/service/admin-passage-service"
import { buildPassageAudio } from "../../fixture/passage-audio"

import { createMockPassageAudioRepository } from "./fixtures"

const passageAudioRepository = createMockPassageAudioRepository()

const NOW = new Date("2026-10-13T09:00:00.000Z")

const PUBLISHED_PASSAGE = { publishedAt: new Date("2026-10-12T03:00:00.000Z"), status: "published" as const }

describe("regenerateAdminPassageAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passageAudioRepository.requestRegeneration.mockResolvedValue(true)
  })

  describe("正常系", () => {
    it("作成済み（ready）の音声に作り直しの依頼を入れ、依頼の日時を返す", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue({ audio: buildPassageAudio(), passage: PUBLISHED_PASSAGE })

      const result = await regenerateAdminPassageAudio(1, NOW, { passageAudioRepository })

      expect(result).toEqual({ ok: true, value: { passageId: 1, regenerateRequestedAt: NOW } })
      expect(passageAudioRepository.requestRegeneration).toHaveBeenCalledWith(1, NOW)
    })

    it("作り直しに失敗している ready（前の音声を出し続けている）にも依頼を入れられる", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue({
        audio: buildPassageAudio({ attemptCount: 3, lastError: "ServiceFailureException" }),
        passage: PUBLISHED_PASSAGE,
      })

      const result = await regenerateAdminPassageAudio(1, NOW, { passageAudioRepository })

      expect(result.ok).toBe(true)
    })
  })

  describe("異常系", () => {
    it("問題が無ければ 404 を返し、更新しない", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue(null)

      const result = await regenerateAdminPassageAudio(1, NOW, { passageAudioRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
      expect(passageAudioRepository.requestRegeneration).not.toHaveBeenCalled()
    })

    it("音声の行が無ければ 409 を返し、更新しない", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue({ audio: null, passage: PUBLISHED_PASSAGE })

      const result = await regenerateAdminPassageAudio(1, NOW, { passageAudioRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageAudioRepository.requestRegeneration).not.toHaveBeenCalled()
    })

    it.each<AudioStatus>(["pending", "generating", "failed"])("%s なら 409 を返し、更新しない", async (status) => {
      passageAudioRepository.findByPassageId.mockResolvedValue({ audio: buildPassageAudio({ status }), passage: PUBLISHED_PASSAGE })

      const result = await regenerateAdminPassageAudio(1, NOW, { passageAudioRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageAudioRepository.requestRegeneration).not.toHaveBeenCalled()
    })

    it.each([
      ["非公開に戻した問題の ready", { ...PUBLISHED_PASSAGE, status: "draft" as const }],
      ["音声を作った後に公開し直された ready（生成タスクの確認待ち）", { ...PUBLISHED_PASSAGE, publishedAt: new Date("2026-10-12T05:00:00.000Z") }],
    ])("%s は表示が準備中なので 409 を返し、更新しない", async (_label, passage) => {
      passageAudioRepository.findByPassageId.mockResolvedValue({ audio: buildPassageAudio(), passage })

      const result = await regenerateAdminPassageAudio(1, NOW, { passageAudioRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageAudioRepository.requestRegeneration).not.toHaveBeenCalled()
    })

    it("requestRegeneration が false（検査の後に状態が変わった）なら 409 を返す", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue({ audio: buildPassageAudio(), passage: PUBLISHED_PASSAGE })
      passageAudioRepository.requestRegeneration.mockResolvedValue(false)

      const result = await regenerateAdminPassageAudio(1, NOW, { passageAudioRepository })

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
    })
  })
})
