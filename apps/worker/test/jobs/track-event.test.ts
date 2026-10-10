import type { JobMessage, TrackEventJobData } from "@repo/queue"

import { trackEvent } from "../../src/jobs/track-event"
import type { EventRepository } from "../../src/repository"

const buildMessage = (
  events: TrackEventJobData["events"],
): JobMessage<TrackEventJobData> => ({
  attemptsMade: 0,
  data: { events },
  id: "job-1",
})

const buildEvent = (
  overrides: Partial<TrackEventJobData["events"][number]> = {},
): TrackEventJobData["events"][number] => ({
  eventId: "11111111-1111-4111-8111-111111111111",
  name: "memo_viewed",
  occurredAt: "2026-01-01T00:00:00.000Z",
  properties: { memo_id: 1 },
  source: "web",
  userId: 7,
  ...overrides,
})

describe("trackEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("複数イベントを 1 回の insertAll にまとめる", async () => {
      const insertAll = vi.fn<EventRepository["insertAll"]>(async () => undefined)
      const handler = trackEvent({ eventRepository: { insertAll } })

      await handler(buildMessage([buildEvent(), buildEvent({ eventId: "2" })]))

      expect(insertAll).toHaveBeenCalledTimes(1)
      expect(insertAll.mock.calls[0]?.[0]).toHaveLength(2)
    })
  })

  describe("異常系", () => {
    it("イベントが空のとき insertAll を呼ばない", async () => {
      const insertAll = vi.fn<EventRepository["insertAll"]>(async () => undefined)
      const handler = trackEvent({ eventRepository: { insertAll } })

      await handler(buildMessage([]))

      expect(insertAll).not.toHaveBeenCalled()
    })

    /**
     * 握りつぶすと BullMQ がジョブを成功扱いにしてリトライが効かなくなる。
     * 送出側（QueueEventTracker）の fire-and-forget とは逆の方針。
     */
    it("insertAll が throw したらそのまま伝播させる", async () => {
      const insertAll = vi.fn<EventRepository["insertAll"]>(async () => {
        throw new Error("clickhouse down")
      })
      const handler = trackEvent({ eventRepository: { insertAll } })

      await expect(handler(buildMessage([buildEvent()]))).rejects.toThrow("clickhouse down")
    })
  })
})
