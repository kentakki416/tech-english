import { createDataWarehouse } from "@repo/data-warehouse"
import { createDrizzleClient } from "@repo/db"
import { logger } from "@repo/logger"
import { COLLECT_SOURCE_QUEUE_NAME, PROCESS_MEMO_QUEUE_NAME, TRACK_EVENT_QUEUE_NAME } from "@repo/queue"
import { createRedisClient } from "@repo/redis"

import { env } from "./env"
import { DataWarehouseEventRepository } from "./repository/data-warehouse"
import { DrizzleMemoRepository, DrizzleSourceCollectionRunRepository } from "./repository/drizzle"
import { createCollectionRuntimeLoader } from "./runtime/collection"
import { setupGracefulShutdown } from "./runtime/graceful-shutdown"
import { startCollectSourceWorker } from "./workers/collect-source-worker"
import { startProcessMemoWorker } from "./workers/process-memo-worker"
import { startTrackEventWorker } from "./workers/track-event-worker"

/**
 * apps/worker のエントリポイント。
 *
 * 各 Worker は `startXxxWorker(...)` で起動し、返り値の `JobConsumer` を
 * graceful shutdown に登録する。新しい queue を増やすときは:
 *   1. `packages/queue` に Job 型と queue 名を追加
 *   2. `src/jobs/<name>.ts` に純粋なハンドラを書く
 *   3. `src/workers/<name>-worker.ts` で組み立てる
 *   4. ここで `startXxxWorker(...)` を呼んで `consumers` に push
 */
const main = (): void => {
  const db = createDrizzleClient({
    onError: (error) => {
      logger.error("db idle client error", error)
    },
    url: env.DATABASE_URL,
  })
  /**
   * BullMQ Worker は `maxRetriesPerRequest: null` の Redis 接続が必須 (BullMQ 5.x 要件)
   */
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
   *
   * `none` は何も書かない実装になる。ClickHouse を持たない環境
   * （Terraform の enable_data_warehouse = false）のための選択肢で、env.ts 側で URL の必須判定も外れる。
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
  const sourceCollectionRunRepository = new DrizzleSourceCollectionRunRepository(db)

  if (!env.GITHUB_CONTENT_TOKEN) {
    logger.warn("GITHUB_CONTENT_TOKEN is not set; GitHub API is used without authentication (60 req/h)")
  }

  const consumers = [
    startCollectSourceWorker({
      githubToken: env.GITHUB_CONTENT_TOKEN,
      limits: { maxDocuments: env.COLLECT_MAX_DOCUMENTS_PER_SOURCE, maxPassages: env.COLLECT_MAX_PASSAGES_PER_RUN },
      loadCollectionRuntime: createCollectionRuntimeLoader({
        contactUrl: env.COLLECT_WEB_CONTACT_URL,
        db,
        token: env.GITHUB_CONTENT_TOKEN,
      }),
      now: () => new Date(),
      redis,
      sourceCollectionRunRepository,
    }),
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
    queues: [COLLECT_SOURCE_QUEUE_NAME, PROCESS_MEMO_QUEUE_NAME, TRACK_EVENT_QUEUE_NAME],
  })
}

main()
