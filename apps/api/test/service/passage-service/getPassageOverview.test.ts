import { getPassageOverview } from "../../../src/service/passage-service"
import { createMockPassageRepository, createMockReadingAttemptRepository } from "../../fixture/passage-repository-mock"

import { buildInProgressAttempt, buildPublishedSummary, buildUnpublishedAttemptContent, FIXED_NOW } from "./fixtures"

const passageRepository = createMockPassageRepository()
const readingAttemptRepository = createMockReadingAttemptRepository()
const repo = { passageRepository, readingAttemptRepository }

/**
 * buildPublishedSummary / buildUnpublishedAttemptContent のソース・問題から作った出典
 */
const EXPECTED_ATTRIBUTION = {
  commitSha: "3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b",
  licenseSpdx: "CC-BY-4.0",
  licenseUrl: "https://github.com/reactjs/react.dev/blob/main/LICENSE-DOCS.md",
  pageUrl: "https://react.dev/learn/synchronizing-with-effects",
  permalinkUrl:
    "https://github.com/reactjs/react.dev/blob/3f9c2a1b4d5e6f708192a3b4c5d6e7f809102a3b/src/content/learn/synchronizing-with-effects.md",
  retrievedAt: new Date("2026-10-10T03:00:00.000Z"),
  sourceKind: "docs",
  sourceName: "React 公式ドキュメント",
}

describe("getPassageOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("公開中の問題は概要・出典・サーバーの現在時刻を canStart: true で返し、挑戦中が無ければ inProgressAttempt は null", async () => {
      const summary = buildPublishedSummary(1)
      passageRepository.findPublishedById.mockResolvedValue(summary)
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(null)

      const result = await getPassageOverview({ now: FIXED_NOW, passageId: 1, userId: 7 }, repo)

      expect(result).toEqual({
        ok: true,
        value: {
          attribution: EXPECTED_ATTRIBUTION,
          canStart: true,
          inProgressAttempt: null,
          passage: summary.passage,
          questionCount: 3,
          serverNow: FIXED_NOW,
        },
      })
      expect(readingAttemptRepository.findAliveInProgress).toHaveBeenCalledWith(7, 1, new Date("2026-10-12T00:00:00.000Z"))
      expect(passageRepository.findAttemptContentById).not.toHaveBeenCalled()
    })

    it("期限内の挑戦中があれば、開始の 24 時間後を expiresAt にして返す", async () => {
      passageRepository.findPublishedById.mockResolvedValue(buildPublishedSummary(1))
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(
        buildInProgressAttempt({ id: 301, startedAt: new Date("2026-10-12T10:00:00.000Z") }),
      )

      const result = await getPassageOverview({ now: FIXED_NOW, passageId: 1, userId: 7 }, repo)

      expect(result.ok && result.value.canStart).toBe(true)
      expect(result.ok && result.value.inProgressAttempt).toEqual({
        expiresAt: new Date("2026-10-13T10:00:00.000Z"),
        id: 301,
        startedAt: new Date("2026-10-12T10:00:00.000Z"),
      })
    })

    it("公開中でなくても期限内の自分の挑戦中があれば、問題の内容から再開用の概要を canStart: false で返す（制限時間は挑戦の開始時点の値）", async () => {
      passageRepository.findPublishedById.mockResolvedValue(null)
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(
        buildInProgressAttempt({ id: 301, startedAt: new Date("2026-10-12T10:00:00.000Z"), timeLimitSeconds: 180 }),
      )
      /**
       * 非公開の間に制限時間が 240 秒に直された
       */
      passageRepository.findAttemptContentById.mockResolvedValue(buildUnpublishedAttemptContent({ timeLimitSeconds: 240 }))

      const result = await getPassageOverview({ now: FIXED_NOW, passageId: 1, userId: 7 }, repo)

      expect(result).toEqual({
        ok: true,
        value: {
          attribution: EXPECTED_ATTRIBUTION,
          canStart: false,
          inProgressAttempt: {
            expiresAt: new Date("2026-10-13T10:00:00.000Z"),
            id: 301,
            startedAt: new Date("2026-10-12T10:00:00.000Z"),
          },
          passage: { id: 1, difficulty: 2, timeLimitSeconds: 180, title: "Synchronizing with Effects", wordCount: 60 },
          questionCount: 3,
          serverNow: FIXED_NOW,
        },
      })
      expect(passageRepository.findAttemptContentById).toHaveBeenCalledWith(1)
    })
  })

  describe("異常系", () => {
    it("公開中でなく、期限内の自分の挑戦中も無ければ 404 を返し、問題の内容を読まない", async () => {
      passageRepository.findPublishedById.mockResolvedValue(null)
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(null)

      const result = await getPassageOverview({ now: FIXED_NOW, passageId: 1, userId: 7 }, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
      expect(passageRepository.findAttemptContentById).not.toHaveBeenCalled()
    })

    it("公開中でない問題の挑戦中があるのに問題が見つからなければ throw する", async () => {
      passageRepository.findPublishedById.mockResolvedValue(null)
      readingAttemptRepository.findAliveInProgress.mockResolvedValue(buildInProgressAttempt())
      passageRepository.findAttemptContentById.mockResolvedValue(null)

      await expect(getPassageOverview({ now: FIXED_NOW, passageId: 1, userId: 7 }, repo)).rejects.toThrow()
    })
  })
})
