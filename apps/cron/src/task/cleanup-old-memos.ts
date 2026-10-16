import { logger } from "@repo/logger"

import { env } from "../env"
import { DrizzleMemoRepository } from "../repository/drizzle"
import { runTask } from "../run-task"
import * as service from "../service"

/**
 * cleanup:old-memos
 *
 * `CLEANUP_MEMO_OLDER_THAN_DAYS` (default: 90) 日より前に作成された memo を
 * まとめて削除する。本番では EventBridge → ECS Scheduled Task で日次 / 週次
 * 起動する想定。
 */
runTask("cleanup-old-memos", async ({ db }) => {
  logger.info("cleanup-old-memos started", {
    olderThanDays: env.CLEANUP_MEMO_OLDER_THAN_DAYS,
  })

  const { deletedCount, threshold } = await service.memo.cleanupOldMemos(
    { now: new Date(), olderThanDays: env.CLEANUP_MEMO_OLDER_THAN_DAYS },
    { memoRepository: new DrizzleMemoRepository(db) },
  )
  logger.info("cleanup-old-memos completed", {
    deletedCount,
    threshold: threshold.toISOString(),
  })
})
