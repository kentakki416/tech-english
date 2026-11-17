import { logger } from "@repo/logger"

import { env } from "../env"
import { DrizzleMemoRepository } from "../repository/drizzle"
import { runTask } from "../run-task"
import * as service from "../service"

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
