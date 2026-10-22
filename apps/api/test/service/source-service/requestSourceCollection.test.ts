import { requestSourceCollection } from "../../../src/service/source-service"

import {
  buildGitHubSource,
  buildSourceCollectionRun,
  buildWebsiteSource,
  createMockCollectSourceQueue,
  createMockSourceCollectionRunRepository,
  createMockSourceRepository,
} from "./fixtures"

const sourceRepository = createMockSourceRepository()
const sourceCollectionRunRepository = createMockSourceCollectionRunRepository()
const collectSourceQueue = createMockCollectSourceQueue()

const NOW = new Date("2026-10-22T04:00:00.000Z")

const callRequestSourceCollection = async (sourceId: number) =>
  requestSourceCollection(sourceId, { sourceCollectionRunRepository, sourceRepository }, { collectSourceQueue, now: NOW })

describe("requestSourceCollection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sourceCollectionRunRepository.failTimedOut.mockResolvedValue(0)
    collectSourceQueue.enqueue.mockResolvedValue()
  })

  describe("正常系", () => {
    it("有効な GitHub のソースなら queued の記録を作り、その id を jobId つきで Queue に積んで記録を返す", async () => {
      const run = buildSourceCollectionRun({ id: 10, sourceId: 1 })
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      sourceCollectionRunRepository.create.mockResolvedValue({ kind: "created", run })

      const result = await callRequestSourceCollection(1)

      expect(result).toEqual({ ok: true, value: run })
      expect(sourceCollectionRunRepository.create).toHaveBeenCalledWith(1)
      expect(collectSourceQueue.enqueue).toHaveBeenCalledWith({ runId: 10 }, { jobId: "collect-source-run-10" })
      expect(sourceCollectionRunRepository.markFailed).not.toHaveBeenCalled()
    })

    it("記録を作る前に、30 分より前から収集中の記録を failed にする", async () => {
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      sourceCollectionRunRepository.create.mockResolvedValue({ kind: "created", run: buildSourceCollectionRun() })

      await callRequestSourceCollection(1)

      expect(sourceCollectionRunRepository.failTimedOut).toHaveBeenCalledWith({
        error: expect.any(String),
        now: NOW,
        sourceId: 1,
        staleBefore: new Date("2026-10-22T03:30:00.000Z"),
      })
      expect(sourceCollectionRunRepository.failTimedOut.mock.invocationCallOrder[0])
        .toBeLessThan(sourceCollectionRunRepository.create.mock.invocationCallOrder[0])
    })
  })

  describe("異常系", () => {
    it.each([
      ["存在しない", null, 404, "NOT_FOUND"],
      ["サイトの", buildWebsiteSource({ id: 1 }), 400, "BAD_REQUEST"],
      ["無効の", buildGitHubSource({ id: 1, isEnabled: false }), 400, "BAD_REQUEST"],
    ] as const)("%sソースなら %s を返し、記録を作らず Queue にも積まない", async (_label, source, statusCode, type) => {
      sourceRepository.findById.mockResolvedValue(source)

      const result = await callRequestSourceCollection(1)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(statusCode)
        expect(result.error.type).toBe(type)
      }
      expect(sourceCollectionRunRepository.create).not.toHaveBeenCalled()
      expect(collectSourceQueue.enqueue).not.toHaveBeenCalled()
    })

    it("そのソースが収集中なら 409 CONFLICT を返し、Queue に積まない", async () => {
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      sourceCollectionRunRepository.create.mockResolvedValue({ kind: "active_exists" })

      const result = await callRequestSourceCollection(1)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(409)
        expect(result.error.type).toBe("CONFLICT")
      }
      expect(collectSourceQueue.enqueue).not.toHaveBeenCalled()
    })

    it("Queue に積めなければ、記録を failed にしてから throw する", async () => {
      const queueError = new Error("redis is down")
      sourceRepository.findById.mockResolvedValue(buildGitHubSource({ id: 1 }))
      sourceCollectionRunRepository.create.mockResolvedValue({ kind: "created", run: buildSourceCollectionRun({ id: 10 }) })
      collectSourceQueue.enqueue.mockRejectedValue(queueError)

      await expect(callRequestSourceCollection(1)).rejects.toBe(queueError)

      expect(sourceCollectionRunRepository.markFailed).toHaveBeenCalledWith({ error: expect.any(String), id: 10, now: NOW })
    })
  })
})
