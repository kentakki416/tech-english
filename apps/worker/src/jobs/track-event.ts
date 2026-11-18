import { logger } from "@repo/logger"
import type { JobProcessor, TrackEventJobData } from "@repo/queue"

import type { EventRepository } from "../repository"

export type TrackEventDeps = {
  eventRepository: EventRepository
}

/**
 * 冪等性: eventId は enqueue 側で採番済みなので、ジョブが再配信されても
 * ClickHouse の ReplacingMergeTree が同じ event_id を 1 件に畳む。
 */
export const trackEvent = (
  deps: TrackEventDeps,
): JobProcessor<TrackEventJobData> =>
  async (message) => {
    const { events } = message.data
    if (events.length === 0) return

    /**
     * 1 ジョブのイベントを 1 回の INSERT にまとめる（ClickHouse は小さな INSERT を大量に受けるとマージの負荷で遅くなる）。
     * 失敗を握りつぶすと BullMQ がジョブを成功として扱いリトライしないので、await して throw させる
     */
    await deps.eventRepository.insertAll(events)

    logger.debug("trackEvent: inserted", {
      count: events.length,
      jobId: message.id,
    })
  }
