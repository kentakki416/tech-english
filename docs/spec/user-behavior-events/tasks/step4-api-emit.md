# step4-api-emit

API から memo のイベントを送出し、フロントからのイベントを受け取る `POST /api/events` を実装する。

## 対応内容

### DI の組み立て

`apps/api/src/index.ts` で `track-event` の `JobQueue` と tracker を 1 回だけ生成する。Redis client は既存のものを使い回す。

```typescript
const trackEventQueue = createBullMQJobQueue<TrackEventJobData>(redis, TRACK_EVENT_QUEUE_NAME)
const eventTracker = new QueueEventTracker(trackEventQueue)
```

api は **データウェアハウスを知らない**（依存に `@repo/data-warehouse` を入れない）。書き込むのは worker だけ。

### service 層からの送出

service は `repo` と同じく **オブジェクト引数** で受け取る。既存の Repository 引数の流儀に合わせる。

```typescript
/** apps/api/src/service/memo-service.ts */
export const deleteMemo = async (
  id: number,
  repo: { memoRepository: MemoRepository },
  deps: { eventTracker: EventTracker; userId: number },
): Promise<Result<void>> => {
  const memo = await repo.memoRepository.findById(id)
  if (!memo) return err(notFoundError("メモが見つかりません"))

  await repo.memoRepository.deleteById(id)

  /** 物理削除なので DB からは復元できない。ここで記録しないと永久に失われる */
  deps.eventTracker.track({
    name: "memo_deleted",
    properties: { memo_id: id },
    source: "api",
    userId: deps.userId,
  })

  return ok(undefined)
}
```

`memo_created` / `memo_updated` も同様に送出する。**送出は `await` しない**（`EventTracker.track` の戻り値は `void`）。

**失敗したときは記録しない**（上の例で `notFound` のときイベントを出さない）。失敗を記録したい場合は `memo_delete_failed` のような別イベントにする。成功イベントに成否フラグを混ぜると集計時に必ず事故る。

### POST /api/events

`@repo/api-schema` にスキーマを定義する（命名規則は `packages/schema/CLAUDE.md`）。

```typescript
/** packages/schema/src/api-schema/event.ts */
export const createEventRequestSchema = z.object({
  events: z
    .array(
      z.object({
        name: z.enum(["memo_created", "memo_deleted", "memo_updated", "memo_viewed"]),
        occurredAt: z.string().datetime(),
        properties: z.record(z.union([z.number(), z.string()])).default({}),
      }),
    )
    .min(1)
    .max(50),
})

export const createEventResponseSchema = z.object({
  accepted: z.number(),
})
```

Controller の要点:

- **`userId` はリクエストボディから受け取らない。** 認証済みユーザーから server 側で解決する（他人の ID を詐称させないため）
- **`source` も server 側で決める。** クライアントの自己申告を信用しない
- **壊れたイベントがあっても 4xx にしない。** 捨てて残りを受理し、`accepted` に実際の件数を返す。分析のためにユーザー体験を壊さないため
- 受け取った配列は **1 回の `trackAll()` でまとめて enqueue する**（1 リクエスト = 1 ジョブ）
- `occurredAt` は **クライアントの時計** なので信用しすぎない。ClickHouse 側の `received_at` と突き合わせて異常値を検出できるようにしておく

Router は `src/routes/event-router.ts` を新設して `/api/events` にマッピングする。

### 認証

`POST /api/events` は認証必須。`PUBLIC_PATHS` に追加しない。

## 動作確認

```bash
pnpm --filter api test
```

Service のユニットテスト（`FakeEventTracker` を使い Redis 不要）:

- [ ] `deleteMemo` 成功時に `memo_deleted` が `memo_id` 付きで 1 件記録されること
- [ ] `deleteMemo` がメモ不在で失敗したときイベントが記録されないこと
- [ ] `createMemo` / `updateMemo` も同様に検証する
- [ ] **tracker が throw してもリクエストが成功すること**（`track` が例外を投げる fake を渡す）

Controller のインテグレーションテスト:

- [ ] 認証なしで 401
- [ ] ボディに `userId` を混ぜても **無視され**、認証済みユーザーの ID が使われること
- [ ] 51 件以上で 400
- [ ] 壊れたイベントが混ざっても 200 で `accepted` が有効な件数になること
- [ ] 3 件のイベントで `trackAll` が **1 回だけ** 呼ばれること（1 リクエスト = 1 ジョブ）

テストケースは `describe` を「正常系」「異常系」で分類する（`apps/api/CLAUDE.md`）。
