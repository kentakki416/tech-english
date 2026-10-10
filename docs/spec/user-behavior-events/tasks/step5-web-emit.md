# step5-web-emit

web からフロント起点のイベント（`memo_viewed`）を **バッファリングして** 送出する。

## 対応内容

### なぜバッファリングするか

1 件ずつ送ると 1 セッションで数十回 API を叩き、その都度認証ミドルウェアを通ることになる。クライアント側でまとめてから送る。

| flush する条件 | 理由 |
| --- | --- |
| バッファが 10 件に達した | 上限を設けないと離脱時にまとめて失う |
| 前回の flush から 5 秒経過 | 操作が止まっても滞留させない |
| `visibilitychange` で hidden になった | タブを閉じる・バックグラウンドへ回る瞬間を捕まえる |

### 送出ヘルパ

フロントは `@repo/events` を import できない（`frontend-boundary` の lint 境界）。`@repo/api-schema` の型だけを使い、API を叩く薄いモジュールを web 側に置く。

```typescript
/** apps/web/src/libs/event-tracker.ts */
import type { CreateEventRequest } from "@repo/api-schema"

type EventInput = CreateEventRequest["events"][number]

const FLUSH_THRESHOLD = 10
const FLUSH_INTERVAL_MS = 5000

let buffer: EventInput[] = []
let timer: ReturnType<typeof setTimeout> | null = null

/**
 * バッファのイベントを送信する
 *
 * 離脱時は通常の fetch が中断されうるため sendBeacon を優先する。
 * sendBeacon は Content-Type を細かく指定できないので Blob で渡す。
 * 送信に失敗しても握りつぶす（行動イベントは欠落を許容する）。
 */
const flushEvents = (): void => {
  if (buffer.length === 0) return

  const payload = JSON.stringify({ events: buffer })
  buffer = []
  if (timer) {
    clearTimeout(timer)
    timer = null
  }

  const blob = new Blob([payload], { type: "application/json" })
  if (navigator.sendBeacon?.("/api/events", blob)) return

  void fetch("/api/events", {
    body: payload,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => {
    /** 分析イベントの失敗はユーザーに影響させない */
  })
}

/**
 * 行動イベントをバッファに積む
 *
 * **await しない前提で呼ぶ。** 分析のためにユーザー操作を待たせない。
 */
export const trackEvent = (event: Omit<EventInput, "occurredAt">): void => {
  buffer.push({ ...event, occurredAt: new Date().toISOString() })

  if (buffer.length >= FLUSH_THRESHOLD) {
    flushEvents()
    return
  }
  timer ??= setTimeout(flushEvents, FLUSH_INTERVAL_MS)
}

/** アプリ起動時に 1 回呼ぶ。タブを閉じる直前に取りこぼさないため */
export const setupEventFlushOnHide = (): (() => void) => {
  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") flushEvents()
  }
  document.addEventListener("visibilitychange", onVisibilityChange)
  return () => document.removeEventListener("visibilitychange", onVisibilityChange)
}
```

### memo_viewed の送出

メモ詳細ページで、表示時に 1 回だけ積む。

- **Client Component から呼ぶ**（`useEffect`）。Server Component から呼ぶとプリフェッチやキャッシュヒットでも記録され、実際には見ていない閲覧が混入する
- 依存配列に `memoId` を入れ、別のメモを開いたときだけ再送する
- React Strict Mode の二重実行に注意する。`useRef` でガードするか、開発時の重複は許容する

`setupEventFlushOnHide()` はルートレイアウトの Client Component で 1 回呼び、クリーンアップを返す。

### 他 app への展開

`apps/admin` / `apps/mobile` も同じ形で置ける。mobile は `document` が無いので `visibilitychange` の代わりに `AppState` の `background` 遷移で flush する。`source` は server 側で判定するのでクライアントは送らない。

## 動作確認

```bash
pnpm --filter web lint
pnpm --filter web exec tsc --noEmit
```

- [ ] メモ詳細ページを 1 枚開いただけでは **すぐに送信されない**（バッファに積まれる）
- [ ] 5 秒待つと `POST /api/events` が 1 回発火する
- [ ] 10 件たまると即座に発火する
- [ ] タブを別タブに切り替えると即座に発火する（`visibilitychange`）
- [ ] **API を停止した状態でページを開いても画面が正常に表示される**（送出失敗が UI に影響しないこと）
- [ ] ClickHouse に `memo_viewed` が入っていること

```sql
SELECT event_name, user_id, properties, occurred_at, received_at
FROM events FINAL
WHERE event_name = 'memo_viewed'
ORDER BY occurred_at DESC
LIMIT 10
```

- [ ] `apps/web` から `@repo/events` を import すると lint error になること（境界の確認。検証後に削除）
