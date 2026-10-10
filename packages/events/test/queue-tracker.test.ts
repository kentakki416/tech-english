import type { JobQueue, TrackEventJobData } from "@repo/queue"

import { QueueEventTracker } from "../src/queue-tracker"

const buildQueue = (
  enqueue: JobQueue<TrackEventJobData>["enqueue"],
): JobQueue<TrackEventJobData> => ({
  close: vi.fn(async () => undefined),
  enqueue,
})

/**
 * resolve のタイミングをテスト側で制御できる Promise
 */
const createDeferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const waitForPendingCallbacks = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve))
}

describe("QueueEventTracker", () => {
  describe("正常系", () => {
    it("複数イベントを 1 回の enqueue にまとめる", () => {
      const enqueue = vi.fn(async () => undefined)
      const tracker = new QueueEventTracker(buildQueue(enqueue))

      tracker.trackAll([
        { name: "memo_viewed", properties: { memo_id: 1 }, source: "web", userId: 7 },
        { name: "memo_viewed", properties: { memo_id: 2 }, source: "web", userId: 7 },
      ])

      expect(enqueue).toHaveBeenCalledTimes(1)
      expect(enqueue.mock.calls[0]?.[0].events).toHaveLength(2)
    })

    it("eventId をイベントごとに異なる UUID で採番する", () => {
      const enqueue = vi.fn(async () => undefined)
      const tracker = new QueueEventTracker(buildQueue(enqueue))

      tracker.trackAll([
        { name: "memo_created", source: "api", userId: 1 },
        { name: "memo_created", source: "api", userId: 1 },
      ])

      const events = enqueue.mock.calls[0]?.[0].events ?? []
      const ids = events.map((e) => e.eventId)
      expect(new Set(ids).size).toBe(2)
      expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    })

    it("properties 未指定のとき空オブジェクトを入れる", () => {
      const enqueue = vi.fn(async () => undefined)
      const tracker = new QueueEventTracker(buildQueue(enqueue))

      tracker.track({ name: "memo_deleted", source: "api", userId: 3 })

      expect(enqueue.mock.calls[0]?.[0].events[0]?.properties).toEqual({})
    })
  })

  describe("異常系", () => {
    it("空配列のとき enqueue を呼ばない", () => {
      const enqueue = vi.fn(async () => undefined)
      const tracker = new QueueEventTracker(buildQueue(enqueue))

      tracker.trackAll([])

      expect(enqueue).not.toHaveBeenCalled()
    })

    /**
     * 分析イベントの失敗でユーザーのリクエストを失敗させないための不変条件。
     * service 層のテストは FakeEventTracker を使うため、ここでしか検証できない。
     */
    it("enqueue が reject しても呼び出し元に例外を伝播させない", async () => {
      const enqueue = vi.fn(async () => {
        throw new Error("redis down")
      })
      const tracker = new QueueEventTracker(buildQueue(enqueue))

      expect(() => {
        tracker.track({ name: "memo_viewed", source: "web", userId: 1 })
      }).not.toThrow()

      /** unhandled rejection にもなっていないことを確認する */
      await waitForPendingCallbacks()
      expect(enqueue).toHaveBeenCalledTimes(1)
    })
  })
})

describe("QueueEventTracker#flush", () => {
  describe("正常系", () => {
    it("送出中の enqueue が完了するまで resolve しない", async () => {
      const deferred = createDeferred()
      const enqueue = vi.fn(() => deferred.promise)
      const tracker = new QueueEventTracker(buildQueue(enqueue))
      tracker.track({ name: "memo_created", source: "api", userId: 1 })

      let flushed = false
      const flushing = tracker.flush().then(() => {
        flushed = true
      })
      await waitForPendingCallbacks()
      expect(flushed).toBe(false)

      deferred.resolve()
      await flushing
      expect(flushed).toBe(true)
    })

    it("複数回の送出をすべて待つ", async () => {
      const first = createDeferred()
      const second = createDeferred()
      const enqueue = vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise)
      const tracker = new QueueEventTracker(buildQueue(enqueue))
      tracker.track({ name: "memo_created", source: "api", userId: 1 })
      tracker.track({ name: "memo_updated", source: "api", userId: 1 })

      let flushed = false
      const flushing = tracker.flush().then(() => {
        flushed = true
      })
      first.resolve()
      await waitForPendingCallbacks()
      expect(flushed).toBe(false)

      second.resolve()
      await flushing
      expect(flushed).toBe(true)
    })

    it("送出中のものが無いときはすぐ resolve する", async () => {
      const tracker = new QueueEventTracker(buildQueue(vi.fn(async () => undefined)))

      await expect(tracker.flush()).resolves.toBeUndefined()
    })
  })

  describe("異常系", () => {
    it("enqueue が reject しても reject しない", async () => {
      const enqueue = vi.fn(async () => {
        throw new Error("redis down")
      })
      const tracker = new QueueEventTracker(buildQueue(enqueue))
      tracker.track({ name: "memo_viewed", source: "web", userId: 1 })

      await expect(tracker.flush()).resolves.toBeUndefined()
    })
  })
})
