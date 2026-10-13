import { getAttemptAudio } from "../../../src/service/attempt-service"
import { AUDIO_TEXT_HASH, buildPassageAudio } from "../../fixture/passage-audio"
import { createMockPassageAudioRepository, createMockReadingAttemptRepository } from "../../fixture/passage-repository-mock"

import { buildAttempt, buildSubmittedAttempt } from "./fixtures"

const passageAudioRepository = createMockPassageAudioRepository()
const readingAttemptRepository = createMockReadingAttemptRepository()
const repo = { passageAudioRepository, readingAttemptRepository }

const BASE_URL = "https://audio.example.com"
const DEPS = { audioPublicUrlBase: BASE_URL }
const INPUT = { attemptId: 301, userId: 7 }

/**
 * buildPassageAudio の問題の公開日時（音声はこの 1 時間後に作った）
 */
const PUBLISHED_AT = new Date("2026-10-12T03:00:00.000Z")

const KEY_PREFIX = `passages/1/${AUDIO_TEXT_HASH}`

describe("getAttemptAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readingAttemptRepository.findByIdForUser.mockResolvedValue(buildAttempt())
    passageAudioRepository.findByPassageId.mockResolvedValue({ audio: buildPassageAudio(), passagePublishedAt: PUBLISHED_AT })
  })

  describe("正常系", () => {
    it("ready なら、ブロックごとのパートの URL（base + キー）・長さ・単語の時刻を返す", async () => {
      const result = await getAttemptAudio(INPUT, repo, DEPS)

      expect(result).toEqual({
        ok: true,
        value: {
          blocks: [
            { blockIndex: 0, parts: [{ durationMs: 1200, url: `${BASE_URL}/${KEY_PREFIX}/0-0.mp3`, words: [[0, 600, 0, 13], [600, 1200, 14, 18]] }] },
            { blockIndex: 1, parts: [{ durationMs: 2400, url: `${BASE_URL}/${KEY_PREFIX}/1-0.mp3`, words: [[0, 2400, 0, 7]] }] },
            {
              blockIndex: 2,
              parts: [
                { durationMs: 900, url: `${BASE_URL}/${KEY_PREFIX}/2-0.mp3`, words: [[0, 900, 0, 2]] },
                { durationMs: 700, url: `${BASE_URL}/${KEY_PREFIX}/2-1.mp3`, words: [[0, 700, 30, 36]] },
              ],
            },
            { blockIndex: 4, parts: [{ durationMs: 1500, url: `${BASE_URL}/${KEY_PREFIX}/4-0.mp3`, words: [] }] },
          ],
          status: "ready",
        },
      })
      expect(readingAttemptRepository.findByIdForUser).toHaveBeenCalledWith(301, 7)
      expect(passageAudioRepository.findByPassageId).toHaveBeenCalledWith(1)
    })

    it("提出済みの挑戦でも音声を返す（結果画面でも使う）", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildSubmittedAttempt())

      const result = await getAttemptAudio(INPUT, repo, DEPS)

      expect(result.ok && result.value.status).toBe("ready")
    })

    it("音声を作った時刻と公開日時が同じなら ready（境界値）", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue({
        audio: buildPassageAudio({ updatedAt: PUBLISHED_AT }),
        passagePublishedAt: PUBLISHED_AT,
      })

      const result = await getAttemptAudio(INPUT, repo, DEPS)

      expect(result.ok && result.value.status).toBe("ready")
    })

    it.each([
      ["音声の行が無い", null],
      ["pending", buildPassageAudio({ manifest: null, status: "pending" })],
      ["generating", buildPassageAudio({ generationStartedAt: new Date("2026-10-12T04:00:00.000Z"), status: "generating" })],
      ["音声を作った後に公開し直された ready（1 ミリ秒後。境界値）", buildPassageAudio({ updatedAt: new Date(PUBLISHED_AT.getTime() - 1) })],
    ])("%s は pending だけを返す", async (_label, audio) => {
      passageAudioRepository.findByPassageId.mockResolvedValue({ audio, passagePublishedAt: PUBLISHED_AT })

      const result = await getAttemptAudio(INPUT, repo, DEPS)

      expect(result).toEqual({ ok: true, value: { status: "pending" } })
    })

    it("failed は failed だけを返す（前の生成のマニフェストがあっても返さない）", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue({
        audio: buildPassageAudio({ attemptCount: 3, lastError: "ServiceFailureException", status: "failed" }),
        passagePublishedAt: PUBLISHED_AT,
      })

      const result = await getAttemptAudio(INPUT, repo, DEPS)

      expect(result).toEqual({ ok: true, value: { status: "failed" } })
    })

    it("audioPublicUrlBase が null（production で未設定）なら、ready の音声があっても pending を返す", async () => {
      const result = await getAttemptAudio(INPUT, repo, { audioPublicUrlBase: null })

      expect(result).toEqual({ ok: true, value: { status: "pending" } })
    })

    it("base の末尾にスラッシュがあっても URL のスラッシュは 1 つ", async () => {
      const result = await getAttemptAudio(INPUT, repo, { audioPublicUrlBase: `${BASE_URL}/` })

      expect(result.ok && result.value.status === "ready" && result.value.blocks[0]?.parts[0]?.url).toBe(`${BASE_URL}/${KEY_PREFIX}/0-0.mp3`)
    })
  })

  describe("異常系", () => {
    it("自分の挑戦が見つからなければ（他人の挑戦・存在しない ID）404 を返し、音声を読まない", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(null)

      const result = await getAttemptAudio(INPUT, repo, DEPS)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
      expect(passageAudioRepository.findByPassageId).not.toHaveBeenCalled()
    })

    it("挑戦の問題が見つからなければ 404 を返す", async () => {
      passageAudioRepository.findByPassageId.mockResolvedValue(null)

      const result = await getAttemptAudio(INPUT, repo, DEPS)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })
  })
})
