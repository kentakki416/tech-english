/**
 * `process-memo` Queue: memo を非同期に処理するサンプル job。
 */
export const PROCESS_MEMO_QUEUE_NAME = "process-memo"

export type ProcessMemoJobData = {
  memoId: number
}

/**
 * 同じ memoId に対する重複 enqueue を防ぐための決定的 jobId。
 * BullMQ では同じ jobId のジョブを add しようとしても黙って捨てられる
 * (他の Queue 実装では best-effort)。
 */
export const buildProcessMemoJobId = (memoId: number): string =>
  `process-memo-${memoId}`
