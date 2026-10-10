# step1-api-event-flush-and-lwa

api を Lambda で動かすための仕上げ。`EventTracker` に `flush()` を足し、レスポンスを返す前に送出中のイベントを送り切る middleware を `FLUSH_EVENTS_BEFORE_RESPONSE=true` のときだけ登録する。あわせて api の Dockerfile に Lambda Web Adapter（LWA）を入れる。既定値は `false` で、LWA は ECS では起動しないため、prd / dev の挙動は変わらない。

設計: [`../README.md`](../README.md#lambda-の凍結とイベント送出) / [api を Lambda で動かす](../README.md#api-を-lambda-で動かす)

## 対応内容

### `EventTracker.flush()`（`packages/events`）

interface に `flush()` を足す。メソッドはアルファベット順に並べる。

```typescript
/** packages/events/src/tracker.ts */
export interface EventTracker {
  /**
   * 送出中のイベントがすべて終わるまで待つ。失敗は実装側で catch 済みなので reject しない。
   *
   * Lambda はレスポンスを返した時点で実行環境を凍結するため、await していない送出が
   * 止まったまま失われうる。レスポンスの前にこれを待つことで取りこぼしを防ぐ
   * （docs/spec/minimal-deploy/README.md「Lambda の凍結とイベント送出」）。
   */
  flush(): Promise<void>
  track(input: TrackEventInput): void
  trackAll(inputs: TrackEventInput[]): void
}
```

`QueueEventTracker` は送出中の Promise を保持し、終わったら外す。`track` / `trackAll` の「await しない・呼び出し元に伝播させない」は変えない。

```typescript
/** packages/events/src/queue-tracker.ts */
export class QueueEventTracker implements EventTracker {
  /** 送出中の enqueue。flush() で待つために保持する（失敗は catch 済み） */
  private readonly _pending = new Set<Promise<void>>()
  private readonly _queue: JobQueue<TrackEventJobData>

  /** ...constructor / track は変えない... */

  public trackAll(inputs: TrackEventInput[]): void {
    if (inputs.length === 0) return

    const occurredAt = new Date().toISOString()
    const pending = this._queue
      .enqueue({ /** ...従来どおり... */ })
      .catch((err: unknown) => {
        /** ...従来どおり logger.error... */
      })
    this._pending.add(pending)
    void pending.finally(() => this._pending.delete(pending))
  }

  public async flush(): Promise<void> {
    await Promise.all(this._pending)
  }
}
```

`FakeEventTracker` は何もしない `flush()` を持つ。

```typescript
  public async flush(): Promise<void> {
    /** 送出を貯めるだけなので、待つものは無い */
  }
```

### flush middleware（`apps/api`）

`res.end` を包み、`flush()` を待ってから本来の `res.end` を呼ぶ。待つ時間には上限を設ける。

```typescript
/** apps/api/src/middleware/flush-events.ts */
import type { NextFunction, Request, Response } from "express"

import type { EventTracker } from "@repo/events"
import { logger } from "@repo/logger"

/** flush を待つ上限。Queue が遅くてもレスポンスを止めすぎないため */
const FLUSH_TIMEOUT_MS = 3000

/**
 * flush を上限付きで待つ。上限に達したら warn を残して先に進む（イベントは失われうる）
 */
const waitForFlush = async (eventTracker: EventTracker): Promise<void> => {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), FLUSH_TIMEOUT_MS)
  })
  const result = await Promise.race([eventTracker.flush().then(() => "flushed" as const), timeout])
  clearTimeout(timer)

  if (result === "timeout") {
    logger.warn("event flush timed out before response", { timeoutMs: FLUSH_TIMEOUT_MS })
  }
}

/**
 * レスポンスを返す前に、送出中の行動イベントを送り切る middleware。
 *
 * Lambda はレスポンスを返した時点で実行環境を凍結するため、service が await せずに
 * 投げた enqueue が止まったまま失われうる。res.end を包んで flush を待ってから返す。
 * service 側の「送出は await しない」という規約はそのまま（待つのはここだけ）。
 *
 * FLUSH_EVENTS_BEFORE_RESPONSE=true のときだけ登録する（ECS ではプロセスが動き続けるので不要）。
 */
export const flushEventsBeforeResponse = (eventTracker: EventTracker) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const end = res.end.bind(res) as (...args: unknown[]) => Response
    res.end = ((...args: unknown[]) => {
      void waitForFlush(eventTracker).finally(() => end(...args))
      return res
    }) as Response["end"]
    next()
  }
```

### env と登録

```typescript
  /**
   * レスポンスを返す前にイベント送出の完了を待つか。
   * レスポンス後に実行環境が凍結される Lambda（minimal 構成）でだけ true にする。
   */
  FLUSH_EVENTS_BEFORE_RESPONSE: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),
```

`src/index.ts` で、ルーティングより前（`requestLogger` の直後）に登録する。`eventTracker` の生成はこの登録より前に置く。

```typescript
/**
 * Lambda ではレスポンス後に実行環境が凍結されるため、送出中のイベントを先に送り切る
 */
if (env.FLUSH_EVENTS_BEFORE_RESPONSE) {
  app.use(flushEventsBeforeResponse(eventTracker))
}
```

### Dockerfile に LWA を入れる（`apps/api/Dockerfile`）

runner ステージに 1 行足す。**バージョンはタグと digest の両方で固定する**（`latest` を使わない。実装時点の最新を確認し、digest は `docker buildx imagetools inspect` で調べる。公開側で同じタグが差し替えられても別のバイナリが入らないようにするため）。

```dockerfile
# Lambda Web Adapter: minimal 構成（Lambda）で Express をそのまま動かすための extension。
# Lambda の実行環境だけが /opt/extensions を読むので、ECS では起動せず何もしない。
# 設計: docs/spec/minimal-deploy/README.md「api を Lambda で動かす」
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0@sha256:17cfd08eff1dfea3f6a9a1e9c65fdac80aa4919b6085e746615530f43f57d2f1 /lambda-adapter /opt/extensions/lambda-adapter
```

`ENTRYPOINT` / `CMD` / `USER` は変えない（Lambda でも `tini -- node dist/index.js` で起動し、LWA が `localhost:8080` に転送する）。

## 動作確認

```bash
pnpm --filter @repo/events test
pnpm --filter api test
```

### テスト

`packages/events`:

- [ ] `QueueEventTracker.flush()` は、`trackAll` の直後に呼ぶと enqueue の完了まで resolve しない（resolve を手動で制御する fake の `JobQueue` で確認）
- [ ] enqueue が reject しても `flush()` は reject しない
- [ ] 送出中のものが無いときの `flush()` はすぐ resolve する
- [ ] 完了した enqueue は保持から外れる（2 回目の `flush()` が前の enqueue を待たない）

`apps/api`（`test/middleware/flush-events.test.ts`、`supertest`）:

- [ ] 正常系: flush が終わるまでレスポンスが返らず、終わったら返る（resolve を手動で制御する fake の `EventTracker` で、resolve 前にレスポンスが届いていないことを確認する）
- [ ] 正常系: レスポンスのステータス・ヘッダー・ボディが middleware なしの場合と同じ
- [ ] 異常系（境界値）: flush が 3 秒以内に終わらないと、3 秒でレスポンスが返り warn が出る（`vi.useFakeTimers()`）
- [ ] middleware を登録しない場合（既定値）、flush は呼ばれない

### Docker イメージ

```bash
docker build -f apps/api/Dockerfile -t project-template-api:lwa .
docker run --rm --entrypoint ls project-template-api:lwa -l /opt/extensions/lambda-adapter
docker run --rm -p 8080:8080 --env-file <ローカル用の env> project-template-api:lwa
curl -s localhost:8080/api/health
```

- [ ] `/opt/extensions/lambda-adapter` が存在する
- [ ] Lambda の外（docker run = ECS と同じ状況）で、従来どおり起動して `/api/health` が `200` を返す（LWA が何もしないことの確認）
- [ ] Lambda 上での動作は [step4](./step4-ci-deploy-min.md) の動作確認で行う
