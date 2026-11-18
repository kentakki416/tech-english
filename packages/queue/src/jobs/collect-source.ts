export const COLLECT_SOURCE_QUEUE_NAME = "collect-source"

export type CollectSourceJobData = {
  runId: number
}

/**
 * 同じ記録に対する重複 enqueue を防ぐための決定的 jobId
 */
export const buildCollectSourceJobId = (runId: number): string => `collect-source-run-${runId}`
