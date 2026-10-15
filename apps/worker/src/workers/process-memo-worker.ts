import { type JobConsumer, PROCESS_MEMO_QUEUE_NAME, startBullMQWorker } from "@repo/queue"
import type { Redis } from "@repo/redis"

import { processMemo } from "../jobs/process-memo"
import type { MemoRepository } from "../repository"

export type StartProcessMemoWorkerArgs = {
  concurrency: number
  memoRepository: MemoRepository
  redis: Redis
}

export const startProcessMemoWorker = (
  args: StartProcessMemoWorkerArgs,
): JobConsumer =>
  startBullMQWorker(args.redis, {
    concurrency: args.concurrency,
    processor: processMemo({ memoRepository: args.memoRepository }),
    queueName: PROCESS_MEMO_QUEUE_NAME,
  })
