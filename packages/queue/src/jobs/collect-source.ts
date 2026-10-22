/**
 * `collect-source` Queue: 1 ソースを収集する job（admin の今すぐ収集）。
 *
 * Producer (apps/api) が収集の実行の記録（source_collection_runs）を queued で作ってから enqueue し、
 * Consumer (apps/worker) がその記録を running にして収集し、結果を書く。
 *
 * 設計: docs/spec/manual-collection/README.md
 */
export const COLLECT_SOURCE_QUEUE_NAME = "collect-source"

export type CollectSourceJobData = {
  runId: number
}

/**
 * 同じ記録に対する重複 enqueue を防ぐための決定的 jobId
 */
export const buildCollectSourceJobId = (runId: number): string => `collect-source-run-${runId}`
