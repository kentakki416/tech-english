import { Queue, UnrecoverableError, Worker } from "bullmq"

import { logger } from "@repo/logger"
import type { Redis } from "@repo/redis"

import type {
  EnqueueOptions,
  JobConsumer,
  JobQueue,
  StartWorkerOptions,
} from "./types"

/**
 * 別実装（SQS / Cloud Tasks 等）に切り替えるときは同じ `JobQueue<T>` を実装した
 * クラスを用意し、app 側の生成箇所だけ差し替える。ハンドラは影響を受けない。
 */
export class BullMQJobQueue<T> implements JobQueue<T> {
  private _queue: Queue<T>

  constructor(redis: Redis, queueName: string) {
    this._queue = new Queue<T>(queueName, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 5000, type: "exponential" },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400 },
      },
    })
    /**
     * BullMQ の Queue は EventEmitter で、Redis 接続障害時に `error` を emit する。
     * リスナが無いと Node の規約で throw され producer プロセスが落ちるため、
     * ログ出力のリスナを必ず登録する。
     */
    this._queue.on("error", (error) => {
      logger.error(
        "[queue] producer error",
        error instanceof Error ? error : new Error(String(error)),
        { queueName },
      )
    })
  }

  public async enqueue(data: T, options?: EnqueueOptions): Promise<void> {
    /**
     * BullMQ 5.x の `Queue.add` は jobName / data を discriminated union で絞る
     * 高度な generic (`ExtractNameType<T,...>` / `ExtractDataType<T,...>`) を
     * 要求するが、ここでは generic な `T` をそのまま受ける queue 抽象越しなので
     * 型推論が決まらない。`never` キャストで通す（実行時挙動は変わらない）。
     */
    await this._queue.add(
      this._queue.name as never,
      data as never,
      {
        delay: options?.delayMs,
        jobId: options?.jobId,
      },
    )
  }

  public async close(): Promise<void> {
    await this._queue.close()
  }
}

/**
 * 失敗がもうリトライされない「終局」かを判定する。
 *
 * `attemptsMade` は **`failed` イベントの発火時点で既に加算済み**（1 オリジン）。
 * JobProcessor に渡る `attemptsMade` は初回実行時 0 なので混同しないこと。
 * ここで `+1` すると最終失敗を 1 回早く error にしてしまう。
 *
 * 試行回数だけでは判定できない終局もある。ハンドラが `UnrecoverableError` を
 * 投げた場合、BullMQ は `attempts` の上限を待たず即 failed set に移すため、
 * 回数だけで見ると初回失敗が「リトライされる」に誤判定される。
 */
const isTerminalJobFailure = (params: {
  attemptsMade: number
  error: Error
  maxAttempts: number
}): boolean =>
  params.attemptsMade >= params.maxAttempts
  || params.error instanceof UnrecoverableError

/** 渡す Redis は `maxRetriesPerRequest: null` が必須（BullMQ 5.x の要件） */
export const startBullMQWorker = <T>(
  redis: Redis,
  options: StartWorkerOptions<T>,
): JobConsumer => {
  const worker = new Worker<T>(
    options.queueName,
    async (job) => {
      await options.processor({
        attemptsMade: job.attemptsMade,
        data: job.data,
        id: job.id ?? "",
      })
    },
    {
      concurrency: options.concurrency ?? 1,
      connection: redis,
    },
  )

  /**
   * Worker も EventEmitter で、Redis 一時切断などで `error` を emit する。
   * `error` リスナが無いと Node の規約で throw され、常駐 worker プロセスが
   * クラッシュするため必ず登録する（日常的に起こる Redis 瞬断で落とさない）。
   */
  worker.on("error", (err) => {
    logger.error(
      "[queue] worker error",
      err instanceof Error ? err : new Error(String(err)),
      { queueName: options.queueName },
    )
  })

  /**
   * 失敗は「まだリトライされる」ものと「終局」に分ける。
   *
   * 前者は backoff 後に自動回復しうるので warn に留める。後者だけが
   * 「データが失われうる」状態なので error にして、アラートの対象を絞る。
   * 最終失敗したジョブは removeOnFail の期間だけ failed セットに残るため、
   * 気付ければ再投入して救済できる。
   */
  worker.on("failed", (job, err) => {
    const error = err instanceof Error ? err : new Error(String(err))
    const attemptsMade = job?.attemptsMade ?? 0
    const maxAttempts = job?.opts.attempts ?? 1
    const metadata = {
      attemptsMade,
      jobId: job?.id,
      maxAttempts,
      queueName: options.queueName,
    }

    if (isTerminalJobFailure({ attemptsMade, error, maxAttempts })) {
      logger.error("[queue] job failed permanently", error, metadata)
      return
    }
    logger.warn("[queue] job failed, will retry", { ...metadata, reason: error.message })
  })

  worker.on("completed", (job) => {
    logger.debug("[queue] job completed", {
      jobId: job.id,
      queueName: options.queueName,
    })
  })

  return {
    close: async (): Promise<void> => {
      await worker.close()
    },
  }
}

/**
 * テストからだけ使う
 */
export const forTesting = { isTerminalJobFailure }
