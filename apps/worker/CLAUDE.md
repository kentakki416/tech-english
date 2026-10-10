# apps/worker

BullMQ からジョブを取り出して処理する常駐型 worker。本番は ECS Service / Kubernetes Deployment を想定。

## 設計の核: Queue 実装を差し替え可能にする

**ジョブハンドラ（`src/jobs/*.ts`）は `@repo/queue` が公開する抽象（`JobProcessor<T>` / `JobMessage<T>`）しか知らない。** BullMQ の `Job` / `Worker` 型を直接 import してよいのは `packages/queue/src/bullmq-queue.ts` と `src/index.ts`（Redis 接続を作る箇所）だけ。

SQS / Cloud Tasks / pg-boss 等へ乗り換えるときは `packages/queue` に同じ `JobQueue<T>` を実装した別クラスを足し、`src/index.ts` の結線を差し替えるだけで、ジョブハンドラは無変更で済む。

## 含まれる Worker

| Queue 名 | ジョブ型 | 処理内容 |
| --- | --- | --- |
| `process-memo` | `ProcessMemoJobData = { memoId: number }` | memo を id で fetch してログ出力（メール送信 / 通知などに差し替える起点） |
| `track-event` | `TrackEventJobData = { events: [...] }` | 行動イベントをデータウェアハウスへ一括 INSERT。1 ジョブに複数イベントが入る |

## Commands

```bash
pnpm dev    # tsx watch で起動
pnpm test   # Vitest（DB / Redis を mock するので DB / Redis 不要）
```

## レイヤード設計のルール

参考実装: `src/jobs/process-memo.ts` / `src/workers/process-memo-worker.ts` / `src/index.ts`。

- **`jobs/<name>.ts`**: 純粋関数（`(deps) => JobProcessor<T>` の factory）。**BullMQ や ioredis を直接 import しない**
- **`workers/<name>-worker.ts`**: Queue 実装とジョブハンドラを結線するだけ。Queue 実装を切り替えるときの唯一の差分対象
- **`repository/`**: interface は `repository/<name>.ts`、DB の実装は `repository/drizzle/`（DI で使う）と `repository/prisma/`（切り替え先）。interface の引数・戻り値は `@repo/domain` の型にする。Drizzle / Prisma の型は実装クラスの内側に閉じる（`@repo/eslint-config/db-boundary` が lint で強制。限界は `packages/eslint-config/README.md`）
- **`src/index.ts`**: 接続生成 → Repository インスタンス化 → Worker 起動 → graceful shutdown 登録。**どのデータウェアハウスを使うかを決めるのはここだけ**（`createDataWarehouse({ type: "clickhouse", ... })`）

Repository の interface は api / cron と意図的に分離する（各 app が必要な操作だけを持つ。共有すると不要なメソッドが漏れる）。一方ドメイン型は `@repo/domain` で共有する。

## 冪等性は必須

BullMQ の stalled 検出 / リトライ / ECS deploy 時の SIGKILL で **同じジョブが複数回実行されうる**。ジョブハンドラは再実行されても DB が壊れない設計にすること。

- read-only 処理は自然に冪等
- write は upsert / 既処理フラグ / 決定的キーでの dedupe で冪等化する
- exactly-once が必要なら DB 側で transactional outbox を組む（worker 単体では実現できない）

`src/runtime/graceful-shutdown.ts` は SIGTERM/SIGINT で全 `JobConsumer.close()`（in-flight ジョブの完了を待つ）→ DB/Redis 切断 → exit 0。1 ジョブの最大処理時間が ECS の `stop_timeout_seconds` を超えないよう設計する。

## 環境変数

| 変数 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `DATABASE_URL` | `NODE_ENV !== "test"` で必須 | - | DB の接続文字列 |
| `DATA_WAREHOUSE_TYPE` | no | `clickhouse` | `clickhouse` / `none`。`none` は何も書き込まない実装になる |
| `DATA_WAREHOUSE_URL` | `DATA_WAREHOUSE_TYPE === "clickhouse"` かつ `NODE_ENV !== "test"` で必須 | - | データウェアハウスの接続 URL。**技術名を入れていない**のはバックエンドを差し替えても env を変えずに済ませるため |
| `DATA_WAREHOUSE_DATABASE` | no | `project_template` | DB 名 |
| `DATA_WAREHOUSE_USER` | no | `default` | ユーザー名 |
| `DATA_WAREHOUSE_PASSWORD` | no | `password` | パスワード |
| `REDIS_URL` | `NODE_ENV !== "test"` で必須 | - | BullMQ 用 Redis |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `LOGGER_TYPE` | no | `pino` | `pino` / `winston` / `console` / `silent` |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error` |
| `WORKER_CONCURRENCY` | no | `10` | 1 worker あたりの同時並行ジョブ数 |

### データウェアハウスを持たない環境

`DATA_WAREHOUSE_TYPE=none` にすると `NoopDataWarehouse` が DI され、行動イベントの
insert がスキップされる（ジョブは成功扱いで completed になる）。**dev はこの設定**で、
分析価値の無い環境のために ClickHouse を常駐させないための逃げ道。

**本番で `none` にしてはいけない。** 呼び出し側から見ると insert は成功するので、
設定を間違えるとイベントが無言で消える。気付けるように insert のたびに
`data warehouse is disabled, skipped insert` を debug ログに出している。

## 新 Queue の追加

`process-memo` 一式（`packages/queue/src/jobs/process-memo.ts` / `src/jobs/process-memo.ts` / `src/workers/process-memo-worker.ts`）をコピーして名前を変えるのが早い。手順:

1. `packages/queue/src/jobs/<name>.ts` に queue 名と Job 型を定義し、`jobs/index.ts` で re-export
2. `src/jobs/<name>.ts` に純粋ハンドラを書く（`@repo/queue` の型だけ import）
3. `src/workers/<name>-worker.ts` で `startBullMQWorker` と結線する
4. `src/index.ts` の `consumers` 配列に追加する

enqueue 側（api 等）は `BullMQJobQueue` を作って `enqueue(data)` するだけ。
