# @repo/events

ユーザー行動イベントの **送出抽象** を提供する共通パッケージ。イベントの型（`EventName` / `TrackEventInput`）と `EventTracker` interface を定義し、実装として Queue 経由の `QueueEventTracker`、イベントを捨てる `NoopEventTracker`（worker を動かさない環境用。api の `EVENT_TRACKER_TYPE=none`）、テスト用の `FakeEventTracker` を持つ。

書き込み先（ClickHouse）は knows しない。それは `@repo/data-warehouse` と `apps/worker` の責務。

## 目次

- [設計の意図](#設計の意図)
- [役割](#役割)
- [重複排除は eventId の採番場所で決まる](#重複排除は-eventid-の採番場所で決まる)
- [イベントを追加する](#イベントを追加する)
- [使い方](#使い方)
- [関連](#関連)

## 設計の意図

**分析のためにユーザーのリクエストを失敗させない。** そのために送出を fire-and-forget にしている。

> 💡 **なぜ `track()` の戻り値が `Promise<void>` ではなく `void` なのか**
> `Promise` を返すと呼び出し側が `await` できてしまい、Redis が落ちているときにメモの保存が遅延したり失敗したりする。**戻り値を `void` にすることで型レベルで await を不可能にしている。** 失敗は実装側が catch して `logger.error` に落とす（欠落は許容し、検知はログで行う）。

```ts
/** tracker.ts ── 戻り値が void なのは意図的 */
export interface EventTracker {
  flush(): Promise<void>
  track(input: TrackEventInput): void
  trackAll(inputs: TrackEventInput[]): void
}
```

> 💡 **`flush()` は service から呼ばない**
> 送出中のイベントが終わるまで待つメソッドで、reject しない。レスポンスを返した時点で実行環境が凍結される Lambda で、送出が途中で止まらないようにするためのもの。api の middleware（`FLUSH_EVENTS_BEFORE_RESPONSE=true` のときだけ登録）がレスポンスの直前に待つ。service の「await しない」は変わらない（[minimal-deploy](../../docs/spec/minimal-deploy/README.md#lambda-の凍結とイベント送出)）。

> 💡 **なぜ interface を挟むのか**
> service 層を transport から切り離すため。現状は Queue 経由だが、「アプリケーションログに吐いてログ基盤で ClickHouse に流す」方式へ切り替えても **service 層は無変更**で済む。検討の経緯は [deferred-event-delivery.md](../../docs/spec/user-behavior-events/deferred-event-delivery.md) を参照。

## 役割

- 記録するイベント名を **文字列リテラルの union** で定義し、未定義のイベント名をコンパイル時に弾く
- `EventTracker` interface で送出を抽象化し、api / web / worker が transport を knows しないようにする
- `eventId` / `occurredAt` を実装側で埋め、呼び出し元に書かせない
- テスト用に `FakeEventTracker` を提供し、**service 層のユニットテストで Redis も ClickHouse も要らない**ようにする

## 重複排除は eventId の採番場所で決まる

配送は BullMQ 経由で **at-least-once** なので、worker が insert 後にクラッシュすると同じイベントが 2 回届く。ClickHouse 側は `ReplacingMergeTree` で `event_id` をキーに畳むが、**それが効くかは採番場所で決まる**。

| 採番場所 | 再配信時 | 結果 |
| --- | --- | --- |
| **enqueue 時（採用）** | 同じ `eventId` が再送される | ReplacingMergeTree が畳める |
| worker 側 | 再配信ごとに別 `eventId` になる | **畳めず重複が残る** |

そのため `QueueEventTracker` が enqueue のタイミングで `randomUUID()` を振っている。worker 側に採番を移してはいけない。

## イベントを追加する

`src/event.ts` の `EVENT_NAMES` に足す。union 型なので、追加せずに使うと型エラーになる。

```ts
export const EVENT_NAMES = [
  "memo_created",
  "memo_deleted",
  "memo_updated",
  "memo_viewed",
] as const
```

web / mobile から送る場合は `@repo/api-schema` の `createEventRequestSchema` にも同じイベント名を追加する（`POST /api/events` のバリデーションがそこで行われる）。

## 使い方

service 層は `EventTracker` を deps で受け取り、**操作が成功したときだけ**記録する。失敗も記録したい場合は別イベントにする（成功イベントに成否フラグを混ぜると集計時に事故る）。

```ts
/** apps/api/src/service/memo-service.ts */
type EventDeps = { eventTracker: EventTracker; userId: number | undefined }

/** 未ログイン時は記録しない（匿名追跡をしない方針） */
const trackIfSignedIn = (deps: EventDeps, event: { name: EventName; memoId: number }): void => {
  if (deps.userId === undefined) return
  deps.eventTracker.track({
    name: event.name,
    properties: { memo_id: event.memoId },
    source: "api",
    userId: deps.userId,
  })
}

export const deleteMemo = async (id: number, repo: MemoRepo, deps: EventDeps) => {
  // ... 削除が成功したあとで送出する。await しない
  trackIfSignedIn(deps, { memoId: id, name: "memo_deleted" })
  return ok({ deleted: true })
}
```

テストでは `FakeEventTracker` を DI して `inputs` を検証する。

## 関連

- [`docs/spec/user-behavior-events/README.md`](../../docs/spec/user-behavior-events/README.md) — 行動イベント基盤の全体設計
- [`packages/queue/`](../queue) — 配送の抽象（BullMQ）
- [`packages/data-warehouse/`](../data-warehouse) — 書き込み先の抽象と重複対策の詳細
- [`apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md) — service 層での送出ルール（`userId` の扱い / optional 認証）
- [`apps/worker/CLAUDE.md`](../../apps/worker/CLAUDE.md) — 消費側の実装
