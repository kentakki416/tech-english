import { logger } from "@repo/logger"
import type { JobProcessor, ProcessMemoJobData } from "@repo/queue"

import type { MemoRepository } from "../repository"

export type ProcessMemoDeps = {
  memoRepository: MemoRepository
}

/**
 * サンプルなので memo をログに出すだけ。読み取りしかしないので、再実行されても結果は変わらない
 */
export const processMemo = (
  deps: ProcessMemoDeps,
): JobProcessor<ProcessMemoJobData> =>
  async (message) => {
    const memo = await deps.memoRepository.findById(message.data.memoId)
    if (!memo) {
      logger.warn("processMemo: memo not found", {
        jobId: message.id,
        memoId: message.data.memoId,
      })
      return
    }
    logger.info("processMemo: processed", {
      jobId: message.id,
      memoId: memo.id,
      title: memo.title,
    })
  }
