import { Queue, UnrecoverableError } from "bullmq"

import type { Redis } from "@repo/redis"

import { BullMQJobQueue, startBullMQWorker } from "../src/bullmq-queue"
import type { JobConsumer } from "../src/types"

import { cleanupQueueKeys, createTestRedis, waitUntil } from "./helper"

type TestJobData = { value: string }

/** テスト専用の queue 名。実運用の queue と混ざらないようにする */
const QUEUE_NAME = "test-bullmq-queue"

let redis: Redis
let consumer: JobConsumer | undefined

beforeEach(async () => {
  redis = createTestRedis()
  await cleanupQueueKeys(redis, QUEUE_NAME)
})

afterEach(async () => {
  await consumer?.close()
  consumer = undefined
  await cleanupQueueKeys(redis, QUEUE_NAME)
  await redis.quit()
})

/**
 * failed セットに入ったジョブ数を数える。
 *
 * 「終局した」ことの確認に使う。BullMQ は failed を sorted set で持つ。
 */
const countFailedJobs = async (client: Redis): Promise<number> =>
  client.zcard(`bull:${QUEUE_NAME}:failed`)

describe("BullMQJobQueue / startBullMQWorker", () => {
  describe("正常系", () => {
    it("enqueue したジョブが processor に渡り、完了する", async () => {
      const received: TestJobData[] = []
      consumer = startBullMQWorker<TestJobData>(redis, {
        processor: async (message) => {
          received.push(message.data)
        },
        queueName: QUEUE_NAME,
      })

      const queue = new BullMQJobQueue<TestJobData>(redis, QUEUE_NAME)
      await queue.enqueue({ value: "hello" })
      await queue.close()

      await waitUntil(() => received.length === 1)

      expect(received).toEqual([{ value: "hello" }])
      expect(await countFailedJobs(redis)).toBe(0)
    })

    /** attemptsMade は processor 側では 0 オリジン（failed イベント側とは起点が違う） */
    it("初回実行時の attemptsMade は 0", async () => {
      const attempts: number[] = []
      consumer = startBullMQWorker<TestJobData>(redis, {
        processor: async (message) => {
          attempts.push(message.attemptsMade)
        },
        queueName: QUEUE_NAME,
      })

      const queue = new BullMQJobQueue<TestJobData>(redis, QUEUE_NAME)
      await queue.enqueue({ value: "first" })
      await queue.close()

      await waitUntil(() => attempts.length === 1)

      expect(attempts).toEqual([0])
    })
  })

  describe("異常系", () => {
    /**
     * 通常のエラーは attempts を使い切るまでリトライされる。
     *
     * enqueue に生の BullMQ Queue を使っているのは、既定の backoff が 5 秒
     * exponential でテストが遅くなるため。`EnqueueOptions` は実装詳細を
     * 隠す設計で attempts / backoff を渡せないので、fixture 側で指定する。
     */
    it("通常のエラーは attempts の回数だけ実行され、最後に failed に入る", async () => {
      let calls = 0
      consumer = startBullMQWorker<TestJobData>(redis, {
        processor: async () => {
          calls += 1
          throw new Error("transient failure")
        },
        queueName: QUEUE_NAME,
      })

      const rawQueue = new Queue(QUEUE_NAME, { connection: redis })
      await rawQueue.add(QUEUE_NAME, { value: "retry-me" }, {
        attempts: 3,
        backoff: { delay: 20, type: "fixed" },
      })
      await rawQueue.close()

      await waitUntil(async () => (await countFailedJobs(redis)) === 1)

      expect(calls).toBe(3)
    })

    /**
     * UnrecoverableError は attempts の上限を待たず即 failed に入る。
     *
     * これが `isTerminalJobFailure` が試行回数だけで判定してはいけない理由で、
     * 回数で見ると初回失敗が「まだリトライされる」に誤判定される。
     */
    it("UnrecoverableError はリトライされず 1 回で failed に入る", async () => {
      let calls = 0
      consumer = startBullMQWorker<TestJobData>(redis, {
        processor: async () => {
          calls += 1
          throw new UnrecoverableError("cannot recover")
        },
        queueName: QUEUE_NAME,
      })

      const rawQueue = new Queue(QUEUE_NAME, { connection: redis })
      await rawQueue.add(QUEUE_NAME, { value: "give-up" }, {
        attempts: 3,
        backoff: { delay: 20, type: "fixed" },
      })
      await rawQueue.close()

      await waitUntil(async () => (await countFailedJobs(redis)) === 1)

      expect(calls).toBe(1)
    })
  })
})
