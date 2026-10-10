/**
 * Queue 実装に依存しない型定義。ジョブハンドラはこれだけを import し、
 * BullMQ 等の実装を直接触らない（別実装への差し替えを可能にするため）。
 */

/** `attemptsMade` は 0 オリジン（初回実行時 0）。failed イベント側は 1 オリジンなので注意 */
export type JobMessage<T> = {
  attemptsMade: number
  data: T
  id: string
}

/** 実装は冪等であること。中断 / リトライで複数回実行されうる */
export type JobProcessor<T> = (message: JobMessage<T>) => Promise<void>

/** 実装によっては一部が無視される (best-effort)。jobId はデデュープに使われる */
export type EnqueueOptions = {
  delayMs?: number
  jobId?: string
}

/** Producer 側 (api / cron) が使う interface */
export interface JobQueue<T> {
  close(): Promise<void>
  enqueue(data: T, options?: EnqueueOptions): Promise<void>
}

export type StartWorkerOptions<T> = {
  /** 同時並行ジョブ数。デフォルト 1 */
  concurrency?: number
  processor: JobProcessor<T>
  queueName: string
}

/** close() は新規取得を止め、in-flight ジョブの完了を待ってから resolve する */
export interface JobConsumer {
  close(): Promise<void>
}
