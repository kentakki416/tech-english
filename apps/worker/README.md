# apps/worker

BullMQ ベースの常駐 worker。`packages/queue` の Queue 抽象を介してジョブを処理するため、別の Queue 実装 (SQS / Cloud Tasks / pg-boss 等) に乗り換える際もハンドラ側のコードは変更不要 (詳細は [`CLAUDE.md`](./CLAUDE.md) 参照)。

## 目次

- [サンプルジョブ](#サンプルジョブ)
- [セットアップ](#セットアップ)
- [enqueue する側のサンプル (api 等から)](#enqueue-する側のサンプル-api-等から)

## サンプルジョブ

| Queue 名 | ペイロード | 処理内容 |
| --- | --- | --- |
| `process-memo` | `{ memoId: number }` | memo を id で fetch してログ出力（メール送信 / 通知などへの差し替えの起点） |

## セットアップ

```bash
# ルートで一度だけ
pnpm install
```

## enqueue する側のサンプル (api 等から)

```ts
import { BullMQJobQueue, PROCESS_MEMO_QUEUE_NAME, buildProcessMemoJobId } from "@repo/queue"
import { createRedisClient } from "@repo/redis"

const redis = createRedisClient({ url: process.env.REDIS_URL })
const queue = new BullMQJobQueue<{ memoId: number }>(redis, PROCESS_MEMO_QUEUE_NAME)

await queue.enqueue(
  { memoId: 42 },
  { jobId: buildProcessMemoJobId(42) },  // 重複 enqueue を防ぐ決定的 ID
)
```

