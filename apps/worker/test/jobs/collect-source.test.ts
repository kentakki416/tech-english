import type { CollectSourceJobData, JobMessage } from "@repo/queue"

import { GitHubNotFoundError, GitHubRateLimitError } from "../../src/client/github"
import { collectSource, type CollectSourceDeps } from "../../src/jobs/collect-source"
import type { SourceCollectionRunClaim, SourceCollectionRunRepository } from "../../src/repository"
import type { CollectionRuntime } from "../../src/runtime/collection"
import { SourceNotCollectableError } from "../../src/service/collection/errors"

/**
 * 想定外の失敗の error ログを確かめるため logger を差し替える（@repo/logger の logger は Proxy で spyOn できない）
 */
const { errorMock, warnMock } = vi.hoisted(() => ({ errorMock: vi.fn(), warnMock: vi.fn() }))
vi.mock("@repo/logger", () => ({ logger: { debug: vi.fn(), error: errorMock, info: vi.fn(), warn: warnMock } }))

const NOW = new Date("2026-10-22T04:00:00.000Z")

const CLAIM: SourceCollectionRunClaim = { runId: 10, sourceId: 3, startedAt: NOW }

const buildMessage = (runId: number): JobMessage<CollectSourceJobData> => ({
  attemptsMade: 0,
  data: { runId },
  id: `collect-source-run-${runId}`,
})

const createDeps = (options: {
  claim?: SourceCollectionRunClaim | null
  collect?: CollectionRuntime["collectSourceById"]
  githubToken?: string
  isWritten?: boolean
} = {}) => {
  const sourceCollectionRunRepository = {
    claim: vi.fn<SourceCollectionRunRepository["claim"]>(async () => (options.claim === undefined ? CLAIM : options.claim)),
    finish: vi.fn<SourceCollectionRunRepository["finish"]>(async () => options.isWritten ?? true),
  }
  const collectSourceById = vi.fn<CollectionRuntime["collectSourceById"]>(
    options.collect ?? (async () => ({ createdPassageCount: 12, fetchedDocumentCount: 5, status: "completed" })),
  )
  const deps: CollectSourceDeps = {
    githubToken: options.githubToken,
    limits: { maxDocuments: 100, maxPassages: 200 },
    loadCollectionRuntime: vi.fn(async () => ({ collectSourceById })),
    now: () => NOW,
    sourceCollectionRunRepository,
  }
  return { collectSourceById, deps, sourceCollectionRunRepository }
}

describe("collectSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("記録を running にし、そのソースを収集して、件数と状態を記録に書く", async () => {
      const { collectSourceById, deps, sourceCollectionRunRepository } = createDeps({ githubToken: "token" })

      await collectSource(deps)(buildMessage(10))

      expect(sourceCollectionRunRepository.claim).toHaveBeenCalledWith(10, NOW)
      expect(collectSourceById).toHaveBeenCalledWith({
        githubMinRateLimitRemaining: 100,
        maxDocuments: 100,
        maxPassages: 200,
        now: NOW,
        sourceId: 3,
      })
      expect(sourceCollectionRunRepository.finish).toHaveBeenCalledWith(
        CLAIM,
        { createdPassageCount: 12, fetchedDocumentCount: 5, status: "completed" },
        NOW,
      )
    })

    it("token が無ければ、認証なしの rate limit の閾値で収集する", async () => {
      const { collectSourceById, deps } = createDeps()

      await collectSource(deps)(buildMessage(10))

      expect(collectSourceById).toHaveBeenCalledWith(expect.objectContaining({ githubMinRateLimitRemaining: 10 }))
    })

    it.each(["limit_reached", "up_to_date", "rate_limited"] as const)("収集が %s で終われば、そのまま記録に書く", async (status) => {
      const { deps, sourceCollectionRunRepository } = createDeps({
        collect: async () => ({ createdPassageCount: 1, fetchedDocumentCount: 2, status }),
      })

      await collectSource(deps)(buildMessage(10))

      expect(sourceCollectionRunRepository.finish).toHaveBeenCalledWith(
        CLAIM,
        { createdPassageCount: 1, fetchedDocumentCount: 2, status },
        NOW,
      )
    })

    it("記録を running にできなければ（時間切れで片付けられた・終わった）、収集せずに終える", async () => {
      const { collectSourceById, deps, sourceCollectionRunRepository } = createDeps({ claim: null })

      await collectSource(deps)(buildMessage(10))

      expect(deps.loadCollectionRuntime).not.toHaveBeenCalled()
      expect(collectSourceById).not.toHaveBeenCalled()
      expect(sourceCollectionRunRepository.finish).not.toHaveBeenCalled()
      expect(warnMock).toHaveBeenCalled()
    })

    it("結果を書けなければ（別の実行に取り直された）、warn を出して throw しない", async () => {
      const { deps } = createDeps({ isWritten: false })

      await expect(collectSource(deps)(buildMessage(10))).resolves.toBeUndefined()
      expect(warnMock).toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("GitHub の rate limit の例外は、件数 0 の rate_limited として書く", async () => {
      const { deps, sourceCollectionRunRepository } = createDeps({
        collect: async () => {
          throw new GitHubRateLimitError("/repos/example/docs/commits/main")
        },
      })

      await collectSource(deps)(buildMessage(10))

      expect(sourceCollectionRunRepository.finish).toHaveBeenCalledWith(
        CLAIM,
        { createdPassageCount: 0, fetchedDocumentCount: 0, status: "rate_limited" },
        NOW,
      )
    })

    it.each(["disabled", "not_found", "website"] as const)("収集できないソース（%s）は、理由つきの failed として書く", async (reason) => {
      const { deps, sourceCollectionRunRepository } = createDeps({
        collect: async () => {
          throw new SourceNotCollectableError(reason, 3)
        },
      })

      await collectSource(deps)(buildMessage(10))

      expect(sourceCollectionRunRepository.finish).toHaveBeenCalledWith(CLAIM, { error: expect.any(String), status: "failed" }, NOW)
    })

    it.each([
      ["GitHub に見つからない（404）", () => new GitHubNotFoundError("/repos/example/docs/commits/main")],
      ["想定外の例外", () => new Error("boom")],
    ])("%s は failed として書き、ジョブは throw しない", async (_label, buildError) => {
      const { deps, sourceCollectionRunRepository } = createDeps({
        collect: async () => {
          throw buildError()
        },
      })

      await expect(collectSource(deps)(buildMessage(10))).resolves.toBeUndefined()
      expect(sourceCollectionRunRepository.finish).toHaveBeenCalledWith(CLAIM, { error: expect.any(String), status: "failed" }, NOW)
    })

    it("想定外の例外は error のログを出す", async () => {
      const { deps } = createDeps({
        collect: async () => {
          throw new Error("boom")
        },
      })

      await collectSource(deps)(buildMessage(10))

      expect(errorMock).toHaveBeenCalled()
    })

    it("記録を running にできない（DB の失敗）ときは throw する（BullMQ のリトライ）", async () => {
      const { deps, sourceCollectionRunRepository } = createDeps()
      sourceCollectionRunRepository.claim.mockRejectedValue(new Error("db is down"))

      await expect(collectSource(deps)(buildMessage(10))).rejects.toThrow("db is down")
    })

    it("結果を書けない（DB の失敗）ときは throw する（BullMQ のリトライ）", async () => {
      const { deps, sourceCollectionRunRepository } = createDeps()
      sourceCollectionRunRepository.finish.mockRejectedValue(new Error("db is down"))

      await expect(collectSource(deps)(buildMessage(10))).rejects.toThrow("db is down")
    })
  })
})
