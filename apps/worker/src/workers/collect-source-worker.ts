import { COLLECT_SOURCE_QUEUE_NAME, type JobConsumer, startBullMQWorker } from "@repo/queue"
import type { Redis } from "@repo/redis"

import { collectSource, type CollectSourceDeps } from "../jobs/collect-source"

export type StartCollectSourceWorkerArgs = CollectSourceDeps & {
  redis: Redis
}

/**
 * `collect-source` Worker の組み立て。
 *
 * 同時に 1 つだけ処理する（別のソースの収集は順番待ちになる）。GitHub の rate limit は token 単位で、並べても速くならないため
 */
export const startCollectSourceWorker = ({ redis, ...deps }: StartCollectSourceWorkerArgs): JobConsumer =>
  startBullMQWorker(redis, {
    concurrency: 1,
    processor: collectSource(deps),
    queueName: COLLECT_SOURCE_QUEUE_NAME,
  })
