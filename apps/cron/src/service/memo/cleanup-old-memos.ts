import { logger } from "@repo/logger"

import type { MemoRepository } from "../../repository"

export type CleanupOldMemosInput = {
  now: Date
  /** この日数より前に作成された memo を削除対象とする */
  olderThanDays: number
}

export type CleanupOldMemosResult = {
  deletedCount: number
  threshold: Date
}

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000

export const cleanupOldMemos = async (
  input: CleanupOldMemosInput,
  repo: { memoRepository: MemoRepository },
): Promise<CleanupOldMemosResult> => {
  const threshold = new Date(input.now.getTime() - input.olderThanDays * MILLIS_PER_DAY)

  logger.debug("cleanupOldMemos: deleting memos older than threshold", {
    olderThanDays: input.olderThanDays,
    threshold: threshold.toISOString(),
  })

  const deletedCount = await repo.memoRepository.deleteOlderThan(threshold)

  logger.debug("cleanupOldMemos: completed", { deletedCount })

  return { deletedCount, threshold }
}
