import express from "express"
import request from "supertest"

import type { EventTracker } from "@repo/events"
import { LoggerFactory } from "@repo/logger"

import { flushEventsBeforeResponse, forTesting } from "../../src/middleware/flush-events"

const { FLUSH_TIMEOUT_MS, waitForFlush } = forTesting

/**
 * flush の挙動だけを差し替えられる EventTracker
 */
const buildTracker = (flush: () => Promise<void>): EventTracker => ({
  flush: vi.fn(flush),
  track: vi.fn(),
  trackAll: vi.fn(),
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

const buildApp = (eventTracker: EventTracker): express.Express => {
  const app = express()
  app.use(flushEventsBeforeResponse(eventTracker))
  app.get("/test", (_req, res) => {
    res.status(201).set("x-test", "1").json({ ok: true })
  })
  return app
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("flushEventsBeforeResponse", () => {
  describe("正常系", () => {
    it("flush が終わるまでレスポンスを返さず、終わったら返す", async () => {
      const deferred = createDeferred()
      const tracker = buildTracker(async () => deferred.promise)

      let responded = false
      const pending = request(buildApp(tracker))
        .get("/test")
        .then((res) => {
          responded = true
          return res
        })

      await vi.waitFor(() => {
        expect(tracker.flush).toHaveBeenCalledTimes(1)
      })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(responded).toBe(false)

      deferred.resolve()
      const res = await pending
      expect(responded).toBe(true)
      expect(res.status).toBe(201)
    })

    it("ステータス・ヘッダー・ボディを変えずに返す", async () => {
      const tracker = buildTracker(async () => undefined)

      const res = await request(buildApp(tracker)).get("/test")

      expect(res.status).toBe(201)
      expect(res.headers["x-test"]).toBe("1")
      expect(res.body).toEqual({ ok: true })
    })
  })

  describe("異常系", () => {
    it("flush が reject してもレスポンスを返し、warn を残す", async () => {
      const warn = vi.spyOn(LoggerFactory.getLogger(), "warn")
      const tracker = buildTracker(async () => {
        throw new Error("unexpected")
      })

      const res = await request(buildApp(tracker)).get("/test")

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ ok: true })
      expect(warn).toHaveBeenCalledTimes(1)
    })
  })
})

describe("waitForFlush", () => {
  describe("正常系", () => {
    it("上限より前に flush が終われば warn を出さずに resolve する", async () => {
      const warn = vi.spyOn(LoggerFactory.getLogger(), "warn")
      const tracker = buildTracker(async () => undefined)

      await waitForFlush(tracker)

      expect(warn).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("flush が終わらないと、上限ちょうどで warn を出して resolve する（境界値）", async () => {
      vi.useFakeTimers()
      const warn = vi.spyOn(LoggerFactory.getLogger(), "warn")
      const tracker = buildTracker(async () => new Promise<void>(() => undefined))

      let settled = false
      const waiting = waitForFlush(tracker).then(() => {
        settled = true
      })

      await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS - 1)
      expect(settled).toBe(false)
      expect(warn).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      await waiting
      expect(settled).toBe(true)
      expect(warn).toHaveBeenCalledTimes(1)
    })
  })
})
