import type { DataWarehouse } from "@repo/data-warehouse"
import type { DrizzleClient } from "@repo/db"
import { logger } from "@repo/logger"
import type { JobConsumer } from "@repo/queue"
import type { Redis } from "@repo/redis"

export type ShutdownDeps = {
  consumers: JobConsumer[]
  dataWarehouse: DataWarehouse
  db: DrizzleClient
  redis: Redis
}

/**
 * ECS は SIGTERM から `stop_timeout_seconds` 以内に終了しないと SIGKILL を送るので、
 * 1 ジョブの最大処理時間がこの値を超えないようにする。超えて止められたジョブは
 * BullMQ の stalled 検出で別の worker がもう一度実行する（ジョブが冪等なら問題ない）。
 */
export const setupGracefulShutdown = (deps: ShutdownDeps): void => {
  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.warn("worker shutdown initiated", { signal })
    try {
      await Promise.all(deps.consumers.map(async (c) => c.close()))
      await Promise.all([
        deps.dataWarehouse.close(),
        deps.db.$disconnect(),
        deps.redis.quit(),
      ])
      logger.info("worker shutdown completed")
      process.exit(0)
    } catch (err) {
      logger.error(
        "worker shutdown failed",
        err instanceof Error ? err : new Error(String(err)),
      )
      process.exit(1)
    }
  }
  process.on("SIGTERM", (signal) => void shutdown(signal))
  process.on("SIGINT", (signal) => void shutdown(signal))
}
