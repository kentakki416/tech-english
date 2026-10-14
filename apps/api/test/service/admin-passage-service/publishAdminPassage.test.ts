import type { PassageStatus } from "@repo/domain"

import type { TransactionContext, TransactionRunner } from "../../../src/repository"
import { publishAdminPassage } from "../../../src/service/admin-passage-service"
import { buildAdminPassageDetail, buildPassage } from "../../fixture/passage-content"

import { createMockPassageAudioRepository, createMockPassageRepository } from "./fixtures"

const passageRepository = createMockPassageRepository()

const passageAudioRepository = createMockPassageAudioRepository()

/**
 * 目印のトークンを tx として callback を実行する（公開と音声の再試行が同じ tx に乗っているかを確かめるため）
 */
const TX = { marker: "tx" } as unknown as TransactionContext

const transactionRunner: TransactionRunner = { run: vi.fn(async (fn) => fn(TX)) }

const repo = { passageAudioRepository, passageRepository, transactionRunner }

const NOW = new Date("2026-10-13T09:00:00.000Z")

describe("publishAdminPassage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passageRepository.transitionStatus.mockResolvedValue(true)
    passageAudioRepository.resetFailed.mockResolvedValue(false)
  })

  describe("正常系", () => {
    it("公開の条件を満たす下書きを published にし、publishedAt / reviewedAt に now を渡す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail())

      const result = await publishAdminPassage(1, NOW, repo)

      expect(result).toEqual({ ok: true, value: { id: 1, status: "published" } })
      expect(passageRepository.transitionStatus).toHaveBeenCalledWith(1, {
        from: ["draft"],
        publishedAt: NOW,
        reviewedAt: NOW,
        to: "published",
      }, TX)
    })

    it("同じトランザクションで、読み上げの音声が failed なら pending に戻す（resetFailed。failed でなければ何もしない）", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail())
      passageAudioRepository.resetFailed.mockResolvedValue(true)

      const result = await publishAdminPassage(1, NOW, repo)

      expect(result).toEqual({ ok: true, value: { id: 1, status: "published" } })
      expect(transactionRunner.run).toHaveBeenCalledTimes(1)
      expect(passageAudioRepository.resetFailed).toHaveBeenCalledWith(1, TX)
      const [transitionOrder] = passageRepository.transitionStatus.mock.invocationCallOrder
      const [resetOrder] = passageAudioRepository.resetFailed.mock.invocationCallOrder
      expect(transitionOrder).toBeLessThan(resetOrder ?? 0)
    })
  })

  describe("異常系", () => {
    it("存在しなければ 404 を返す", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(null)

      const result = await publishAdminPassage(1, NOW, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })

    it.each<PassageStatus>(["collected", "generating", "published", "rejected", "failed"])("%s なら 409 を返す", async (status) => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({ passage: buildPassage({ status }) }))

      const result = await publishAdminPassage(1, NOW, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageRepository.transitionStatus).not.toHaveBeenCalled()
      expect(passageAudioRepository.resetFailed).not.toHaveBeenCalled()
    })

    it("公開の条件を満たさなければ 400 と details を返し、遷移しない", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail({
        passage: buildPassage({ difficulty: null, timeLimitSeconds: null }),
      }))

      const result = await publishAdminPassage(1, NOW, repo)

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

    it("transitionStatus が false（検査の後に状態が変わった）なら 409 を返し、音声は戻さない", async () => {
      passageRepository.findAdminDetail.mockResolvedValue(buildAdminPassageDetail())
      passageRepository.transitionStatus.mockResolvedValue(false)

      const result = await publishAdminPassage(1, NOW, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(passageAudioRepository.resetFailed).not.toHaveBeenCalled()
    })
  })
})
