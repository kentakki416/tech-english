# @repo/queue

ジョブキューの **型定義・キューへの追加（enqueue）・pickup（取り出し → ハンドラ起動）を抽象化** した共通パッケージ。キューに積むのは「何をするか」のデータ（ペイロード）だけで、実処理（`JobProcessor` の中身）はパッケージに持たず worker 側が実装・注入する。

## 目次

- [設計の意図](#設計の意図)
- [役割](#役割)
- [設計の核](#設計の核)
  - [コンポーネント間の関係性](#コンポーネント間の関係性)
  - [全体の流れ](#全体の流れ)
- [失敗の分類](#失敗の分類)
- [使い方](#使い方)
  - [Producer 側（api / cron から enqueue）](#producer-側api--cron-から-enqueue)
- [関連](#関連)

## 設計の意図

**`JobQueue<T>` / `JobProcessor<T>` を interface で抽象化し、実装を差し替え可能にする。** デフォルトは BullMQ だが、producer もジョブハンドラも interface しか knows しないため、SQS / Cloud Tasks 等へ乗り換えても **ハンドラ無変更** で実装だけ入れ替えられる（Strategy / 依存性逆転）。

> 💡 **なぜ Factory ではなく Strategy か**
> producer（enqueue）と consumer（dequeue）で生成の仕方が異なり、必要なクライアントも実装ごとに redis / SQS / Cloud Tasks とバラバラ。これらを 1 つの生成関数にまとめる Factory は無理があるため、生成は各 app の composition root に任せ、利用側を interface に依存させる Strategy にしている。

> 💡 **BullMQ 実装では `error` リスナが必須**
> BullMQ の `Queue` / `Worker` は EventEmitter で、Redis 障害時に `error` を emit する。リスナが無いと Node 規約で throw → プロセスが落ちるため、本パッケージ内で必ず登録している（[@repo/redis](../redis/README.md) の `error` 対策と同根）。

```ts
/** bullmq-queue.ts ── Queue / Worker いずれにも error リスナを必ず登録する */
this._queue.on("error", (err) => logger.error("[queue] producer error", err, { queueName }))
worker.on("error", (err) => logger.error("[queue] worker error", err, { queueName }))
```

## 役割

- Producer (api / cron 等) と Worker (apps/worker) が **同じ Job 型・同じ Queue 名** を共有
- BullMQ への依存を本パッケージに閉じ込め、**ジョブハンドラ側は実装を knows しない**
- 将来 SQS / Cloud Tasks / pg-boss / Inngest 等に乗り換える際、**ハンドラ無変更** で実装だけ差し替え可能

## 設計の核

### コンポーネント間の関係性

```
┌────────────────────┐        ┌──────────────────┐
│  apps/api (producer) │ ──▶ │ JobQueue<T>      │ ◀── 実装は BullMQ / SQS / ...
└────────────────────┘        │  .enqueue(...)   │
                              └──────────────────┘
                                       │
                                       ▼
┌────────────────────┐        ┌──────────────────┐
│ apps/worker (jobs/) │ ◀──── │ JobProcessor<T>  │ ◀── 実装に依存しない純粋関数
└────────────────────┘        │  (msg) => Promise │
                              └──────────────────┘
```

### 全体の流れ
```
[api / cron]                    [Redis]                 [worker プロセス]
queue.enqueue({memoId:42}) ──▶  process-memo  ──pull──▶  new Worker のループ
                                  キューに積む            │ job 受信
                                                         ▼
                                                  processor({ data:{memoId:42} })
                                                         ▼
                                                  processMemo ハンドラ
                                                  = memoRepository.findById + ログ
```

## 失敗の分類

`isTerminalJobFailure` は失敗が「もうリトライされない終局」かを判定する。
`startBullMQWorker` が log level の出し分けに使っており、**終局だけを `error`**、
リトライ余地のあるものは `warn` にしてアラート対象を絞っている。

判定に 2 つの条件があるのは、試行回数だけでは終局を判定できないため。

| 条件 | 理由 |
| --- | --- |
| `attemptsMade >= maxAttempts` | `attemptsMade` は `failed` イベントの発火時点で**既に加算済み**（1 オリジン）。`JobProcessor` に渡る値は初回 0 なので混同しないこと |
| `error instanceof UnrecoverableError` | BullMQ はこれを `attempts` の上限を待たず即 failed set に移すため、回数で見ると初回失敗を「リトライされる」と誤判定する |

## 使い方

### Producer 側（api / cron から enqueue）

```ts
import {
  BullMQJobQueue,
  PROCESS_MEMO_QUEUE_NAME,
  buildProcessMemoJobId,
  type ProcessMemoJobData,
} from "@repo/queue"
import { createRedisClient } from "@repo/redis"

const redis = createRedisClient({ options: { maxRetriesPerRequest: null } })
const queue: JobQueue<ProcessMemoJobData> = new BullMQJobQueue(
  redis,
  PROCESS_MEMO_QUEUE_NAME,
)

await queue.enqueue(
  { memoId: 42 },
  { jobId: buildProcessMemoJobId(42) },  // 決定的 ID で重複 enqueue を防ぐ
)
```

## 関連

- [apps/worker/README.md](../../apps/worker/README.md) / [apps/worker/CLAUDE.md](../../apps/worker/CLAUDE.md)
- [BullMQ 公式ドキュメント](https://docs.bullmq.io/) — デフォルト Queue 実装 BullMQ の概要・特徴
