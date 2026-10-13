import { getPassageOverview } from "../../../src/service/passage-service"
import { createMockPassageRepository, createMockReadingAttemptRepository } from "../../fixture/passage-repository-mock"

import { buildInProgressAttempt, buildPublishedSummary, FIXED_NOW } from "./fixtures"

const passageRepository = createMockPassageRepository()
const readingAttemptRepository = createMockReadingAttemptRepository()
const repo = { passageRepository, readingAttemptRepository }

describe("getPassageOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("概要・出典・サーバーの現在時刻を返し、挑戦中が無ければ inProgressAttempt は null", async () => {
      const summary = buildPublishedSummary(1)
      passageRepository.findPublishedById.mockResolvedValue(summary)
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(null)

      const result = await getPassageOverview({ now: FIXED_NOW, passageId: 1, userId: 7 }, repo)

      expect(result).toEqual({
        ok: true,
        value: {
          attribution: {
            commitSha: "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b",
            licenseSpdx: "CC-BY-4.0",
            licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
            pageUrl: "https://react.dev/learn/synchronizing-with-effects",
            permalinkUrl:
              "https://github.com/reactjs/react.dev/blob/3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b/src/content/learn/synchronizing-with-effects.md",
            retrievedAt: new Date("2026-10-10T03:00:00.000Z"),
            sourceKind: "docs",
            sourceName: "React 公式ドキュメント",
          },
          inProgressAttempt: null,
          passage: summary.passage,
          questionCount: 3,
          serverNow: FIXED_NOW,
        },
      })
      expect(readingAttemptRepository.findAliveInProgress).toHaveBeenCalledWith(7, 1, new Date("2026-10-12T00:00:00.000Z"))
    })

    it("期限内の挑戦中があれば、開始の 24 時間後を expiresAt にして返す", async () => {
      passageRepository.findPublishedById.mockResolvedValue(buildPublishedSummary(1))
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(
        buildInProgressAttempt({ id: 301, startedAt: new Date("2026-10-12T10:00:00.000Z") }),
      )

      const result = await getPassageOverview({ now: FIXED_NOW, passageId: 1, userId: 7 }, repo)

      expect(result.ok && result.value.inProgressAttempt).toEqual({
        expiresAt: new Date("2026-10-13T10:00:00.000Z"),
        id: 301,
        startedAt: new Date("2026-10-12T10:00:00.000Z"),
      })
    })
  })

  describe("異常系", () => {
    it("公開中でなければ 404 を返し、挑戦を読まない", async () => {
      passageRepository.findPublishedById.mockResolvedValue(null)

      const result = await getPassageOverview({ now: FIXED_NOW, passageId: 1, userId: 7 }, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
      expect(readingAttemptRepository.findAliveInProgress).not.toHaveBeenCalled()
    })
  })
})
