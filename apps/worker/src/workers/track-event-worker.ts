import { type JobConsumer, startBullMQWorker, TRACK_EVENT_QUEUE_NAME } from "@repo/queue"
import type { Redis } from "@repo/redis"

import { trackEvent } from "../jobs/track-event"
import type { EventRepository } from "../repository"

export type StartTrackEventWorkerArgs = {
  concurrency: number
  eventRepository: EventRepository
  redis: Redis
}

export const startTrackEventWorker = (
  args: StartTrackEventWorkerArgs,
): JobConsumer =>
  startBullMQWorker(args.redis, {
    concurrency: args.concurrency,
    processor: trackEvent({ eventRepository: args.eventRepository }),
    queueName: TRACK_EVENT_QUEUE_NAME,
  })
