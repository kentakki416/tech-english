import { randomUUID } from "node:crypto"

import { logger } from "@repo/logger"
import type { JobQueue, TrackEventJobData } from "@repo/queue"

import type { TrackEventInput } from "./event"
import type { EventTracker } from "./tracker"

/**
 * queue へ enqueue するだけの EventTracker
 *
 * enqueue を await せず、失敗しても呼び出し元に伝播させない。
 * Redis が落ちていてもユーザーのリクエストは成功させるため。
 *
 * eventId は **ここで採番する**。BullMQ は at-least-once で同じジョブが
 * 再配信されうるが、worker 側で採番すると再配信のたびに別 ID になり
 * ClickHouse の ReplacingMergeTree が重複を畳めなくなる。
 */
export class QueueEventTracker implements EventTracker {
  /** 送出中の enqueue。flush() で待つために保持する（失敗は catch 済み） */
  private readonly _pending = new Set<Promise<void>>()
  private readonly _queue: JobQueue<TrackEventJobData>

  constructor(queue: JobQueue<TrackEventJobData>) {
    this._queue = queue
  }

  public async flush(): Promise<void> {
    await Promise.all(this._pending)
  }

  public track(input: TrackEventInput): void {
    this.trackAll([input])
  }

  public trackAll(inputs: TrackEventInput[]): void {
    if (inputs.length === 0) return

    const occurredAt = new Date().toISOString()
    const pending = this._queue
      .enqueue({
        events: inputs.map((input) => ({
          eventId: randomUUID(),
          name: input.name,
          occurredAt,
          properties: input.properties ?? {},
          source: input.source,
          userId: input.userId,
        })),
      })
      .catch((err: unknown) => {
        /**
         * 呼び出し元には伝播させないが、ここで落ちたイベントは失われるので
         * error として残す（Redis 障害の検知点になる）。
         */
        logger.error(
          "failed to enqueue events",
          err instanceof Error ? err : new Error(String(err)),
          { count: inputs.length },
        )
      })
    this._pending.add(pending)
    void pending.finally(() => this._pending.delete(pending))
  }
}
