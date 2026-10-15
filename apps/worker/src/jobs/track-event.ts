import { logger } from "@repo/logger"
import type { JobProcessor, TrackEventJobData } from "@repo/queue"

import type { EventRepository } from "../repository"

export type TrackEventDeps = {
  eventRepository: EventRepository
}

/**
 * `track-event` ジョブハンドラ
 *
 * 1 ジョブに複数イベントが入っているので、まとめて 1 回の INSERT にする。
 * ClickHouse は小さな INSERT を大量に受けるとマージ負荷で劣化するため。
 *
 * **ここでは await して失敗を伝播させる**（送出側の fire-and-forget と逆）。
 * 握りつぶすと BullMQ がジョブを成功扱いにしてリトライが効かなくなる。
 */
export const trackEvent = (
  deps: TrackEventDeps,
): JobProcessor<TrackEventJobData> =>
  async (message) => {
    const { events } = message.data
    if (events.length === 0) return

    await deps.eventRepository.insertAll(events)

    logger.debug("trackEvent: inserted", {
      count: events.length,
      jobId: message.id,
    })
  }
