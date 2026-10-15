import { createDataWarehouse } from "@repo/data-warehouse"
import { createDrizzleClient } from "@repo/db"
import { logger } from "@repo/logger"
import { PROCESS_MEMO_QUEUE_NAME, TRACK_EVENT_QUEUE_NAME } from "@repo/queue"
import { createRedisClient } from "@repo/redis"

import { env } from "./env"
import { DataWarehouseEventRepository } from "./repository/data-warehouse"
import { DrizzleMemoRepository } from "./repository/drizzle"
import { setupGracefulShutdown } from "./runtime/graceful-shutdown"
import { startProcessMemoWorker } from "./workers/process-memo-worker"
import { startTrackEventWorker } from "./workers/track-event-worker"

const main = (): void => {
  const db = createDrizzleClient({
    onError: (error) => {
      logger.error("db idle client error", error)
    },
    url: env.DATABASE_URL,
  })
  const redis = createRedisClient({
    onError: (error) => {
      logger.error("redis connection error", error)
    },
    options: { maxRetriesPerRequest: null },
    url: env.REDIS_URL,
  })

  /**
   * どのデータウェアハウスを使うかを決めるのはここだけ。
   * Repository 以降は DataWarehouse 抽象にしか依存しない。
   */
  const dataWarehouse = env.DATA_WAREHOUSE_TYPE === "none"
    ? createDataWarehouse({ type: "none" })
    : createDataWarehouse({
      database: env.DATA_WAREHOUSE_DATABASE,
      password: env.DATA_WAREHOUSE_PASSWORD,
      type: "clickhouse",
      url: env.DATA_WAREHOUSE_URL ?? "",
      username: env.DATA_WAREHOUSE_USER,
    })

  const memoRepository = new DrizzleMemoRepository(db)
  const eventRepository = new DataWarehouseEventRepository(dataWarehouse)

  const consumers = [
    startProcessMemoWorker({
      concurrency: env.WORKER_CONCURRENCY,
      memoRepository,
      redis,
    }),
    startTrackEventWorker({
      concurrency: env.WORKER_CONCURRENCY,
      eventRepository,
      redis,
    }),
  ]

  setupGracefulShutdown({ consumers, dataWarehouse, db, redis })

  logger.info("worker started", {
    concurrency: env.WORKER_CONCURRENCY,
    dataWarehouseType: env.DATA_WAREHOUSE_TYPE,
    queues: [PROCESS_MEMO_QUEUE_NAME, TRACK_EVENT_QUEUE_NAME],
  })
}

main()
