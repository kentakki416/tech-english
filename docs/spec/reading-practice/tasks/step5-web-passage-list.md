# step5-web-passage-list

web の問題一覧（`/passages`）と開始確認（`/passages/[id]`）を、確定済みのモックを移植して作る。見た目の正本はモック（`apps/web/src/app/mock/passages/**`）、画面の仕様は [UI 設計の問題一覧](../README.md#問題一覧) と [開始確認](../README.md#開始確認)。

## 前提

- [step2-api-passage-list](./step2-api-passage-list.md)、[step3-api-attempt-start](./step3-api-attempt-start.md)
- [github-auth step3-web-github-login](../../github-auth/tasks/step3-web-github-login.md)：ログイン済みで画面を開ける。フォント（Literata / IBM Plex Sans JP / IBM Plex Mono）とダークテーマ（`bg-canvas`）が root layout に入っている。`Wordmark`（`src/components/ui/`）と本文リーダー（`src/components/features/passage/PassageReader.tsx`・`passage-text.ts`・`types.ts`）が移植済み
- [learning-record step4-web-mypage](../../learning-record/tasks/step4-web-mypage.md)：共通ヘッダー `AppHeader`・`ScoreSquares`（`src/components/ui/`）、`formatSeconds`（`src/libs/format.ts`）、`QUESTION_TYPE_LABELS`（`src/components/features/passage/labels.ts`）が移植済み
- モックの `_components/parts.tsx` の残り（`SourceMeta` / `DifficultyMeter`）は **この step で** `src/components/features/passage/` に移す。種別・難易度のラベルは `labels.ts` に足す。`Keycap`（キー操作の表示）は step6 で `src/components/ui/Keycap.tsx` に移す

## 対応内容

### 1. API 呼び出し

```ts
/** apps/web/src/features/passage/passage.api.ts */
import "server-only"

export const passageApi = {
  getDetail: async (id: number): Promise<GetPassageResponse> => {
    const raw = await apiClient.get<unknown>(`/api/passage/${id}`)
    return getPassageResponseSchema.parse(raw)
  },
  getList: async (query: PassageListQuery): Promise<GetPassageListResponse> => {
    const raw = await apiClient.get<unknown>(`/api/passage?${buildPassageSearchParams(query)}`)
    return getPassageListResponseSchema.parse(raw)
  },
  getRandom: async (query: PassageFilterQuery): Promise<GetRandomPassageResponse> => { ... },
}

/** apps/web/src/features/attempt/attempt.api.ts（step6 で getDetail / submit を足す） */
import "server-only"

export const attemptApi = {
  start: async (passageId: number): Promise<StartAttemptResponse> => {
    const raw = await apiClient.post<unknown>(`/api/passage/${passageId}/attempt`, {})
    return startAttemptResponseSchema.parse(raw)
  },
}
```

- `src/features/passage/passage-query.ts`（`server-only` を付けない。Client Component の絞り込みからも使う）：
  - `type PassageFilterQuery = { difficulty: number[]; kind: "docs" | "github" | null; tag: string[]; unattemptedOnly: boolean }`、`type PassageListQuery = PassageFilterQuery & { cursor?: string }`
  - `parsePassageSearchParams(searchParams): PassageFilterQuery`：`getPassageListQueryStringSchema.safeParse` し、失敗したら絞り込み無しにする（URL を手で壊しても 400 の画面にしない）
  - `buildPassageSearchParams(query): URLSearchParams`：API と同じ名前（`kind` / `tag` / `difficulty` / `unattempted_only` / `cursor`）。空の条件は付けない。画面の URL もこの形にする
- 型は `@repo/api-schema` から取る（`z.infer` の型。ローカルに型を定義しない）

### 2. 問題一覧（`/passages`）

モックの `mock/passages/page.tsx` と `PassageList.tsx` を移植し、ダミーデータを API に置き換える。

| ファイル | 中身 |
| --- | --- |
| `src/app/passages/page.tsx` | Server Component。`searchParams` を `parsePassageSearchParams` → `passageApi.getList({ ...filter })`（`limit` は既定の 20）。見出し・「ランダムに 1 問解く」・`PassageFilters`・件数・`PassageList` を並べる。`metadata.title` は「問題」 |
| `src/components/features/passage/PassageFilters.tsx` | `"use client"`。モックの絞り込み部分（種別のセグメント・難易度と技術タグのチップ・未挑戦のみのトグル）。技術タグはレスポンスの `tags`。押したら `router.replace(\`/passages?${buildPassageSearchParams(next)}\`, { scroll: false })`（適用ボタンは無い）。`useTransition` の pending 中は一覧を `opacity-60` にする |
| `src/components/features/passage/PassageList.tsx` | `"use client"`。モックの行の見た目。`initialPage`（1 ページ目）と `query` を props で受け、2 ページ目以降は「さらに表示」（副ボタン）で `/api/passages?...&cursor=` から取得して後ろに足す。`page.tsx` で `key={buildPassageSearchParams(filter).toString()}` を付け、絞り込みが変わったら状態を捨てる |
| `src/app/api/passages/route.ts` | Route Handler。`parsePassageSearchParams` + `cursor` で `passageApi.getList` を呼んで JSON を返す（Client Component からの追加の取得用） |

- 行の挑戦状況：`my_status.in_progress_attempt_id` があれば「挑戦中」、`attempt_count === 0` なら「未挑戦」、それ以外は `ScoreSquares`（`question_count` 個のうち `best_correct_count` 個を正解）と `3/4`
- 行のリンクは `/passages/{id}`（挑戦中かどうかは開始確認が API から判断する。モックの `?state=resume` は付けない）
- 0 件のとき：モックの空の状態。「絞り込みを解除する」は `router.replace("/passages")`
- 「ランダムに 1 問解く」：`/passages/random?{kind,tag,difficulty}` への `Link`。`total_count === 0` のときは無効の見た目にする

```ts
/** apps/web/src/app/passages/random/page.tsx（GET 相当なので Server Action にしない） */
export default async function RandomPassagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filter = parsePassageSearchParams(await searchParams)
  const id = await passageApi.getRandom(filter).then((result) => result.id).catch((error: unknown) => {
    if (error instanceof ApiClientError && error.status === 404) return null
    throw error
  })
  /** redirect は例外で実現されるので try / catch の外で呼ぶ */
  redirect(id === null ? `/passages?${buildPassageSearchParams(filter)}` : `/passages/${id}`)
}
```

`/passages/random` は静的なセグメントなので `/passages/[id]` より優先される。

### 3. 開始確認（`/passages/[id]`）

モックの `mock/passages/[id]/page.tsx` を移植する。

- `src/app/passages/[id]/page.tsx`：Server Component。`params.id` を `getPassagePathParamSchema` で検証し、失敗または API の 404 なら `notFound()`。タイトル・4 項目（難易度・英単語数・制限時間・設問）・説明・ボタン・出典（`出典：{source_name}（{license_spdx}）。一部を抜粋・改変しています。`）
- `in_progress_attempt` があれば説明の部分を `ResumeNotice` に、ボタンを「再開する」にする
- ボタンは `StartAttemptForm`（`"use client"`）。`useActionState(startAttemptAction.bind(null, passage.id), {})` の `<form>` と既存の `SubmitButton`（送信中は無効）。失敗したらボタンの下に `message` を出す

```ts
/** apps/web/src/app/passages/[id]/actions.ts */
"use server"

export type StartAttemptState = { message?: string }

export const startAttemptAction = async (passageId: number, _prev: StartAttemptState, _formData: FormData): Promise<StartAttemptState> => {
  let attemptId: number
  try {
    attemptId = (await attemptApi.start(passageId)).id
  } catch {
    return { message: "開始できませんでした。時間をおいて再度お試しください。" }
  }
  redirect(`/attempts/${attemptId}`)
}
```

`ResumeNotice`（`src/components/features/passage/ResumeNotice.tsx`、`"use client"`）：

- 端末に保存した途中経過（step6 の `readAttemptProgress(attemptId)`）から「残り m:ss」（`time_limit_seconds - elapsedSeconds`。負なら `超過 +m:ss`）と「回答 n / 設問数」を出す。保存が無い（別の端末で始めた）ときは経過 0・回答 0 として出す（[時間の計測](../README.md#時間の計測)）
- 「あと N 時間で期限切れになります。」は `expires_at` と、`server_now` で補正した現在時刻（`Date.now() + (Date.parse(server_now) - 描画時の Date.now())`）の差を時間に切り上げる。1 時間未満は「あと 1 時間以内に期限切れになります。」
- `localStorage` はサーバーで読めないので、`useEffect` で読んでから数字を出す（hydration のずれを防ぐ）

### 4. 端末の途中経過の保存（`src/features/attempt/attempt-progress.ts`）

step6 の解答画面が書き、この step の `ResumeNotice` と step7 が読む・消す。`server-only` を付けない。

```ts
/** キーは挑戦 ID ごと */
export const ATTEMPT_PROGRESS_KEY_PREFIX = "attempt-progress:"

export type AttemptProgress = {
  answers: Record<number, number>
  elapsedSeconds: number
  translatedBlockIndexes: number[]
  version: 1
  /** 提出の word_lookups にそのまま使う */
  wordLookups: { glossaryEntryId: number | null; lemma: string; source: "dictionary" | "glossary"; surface: string }[]
}

export const readAttemptProgress = (attemptId: number): AttemptProgress | null => { ... }
export const writeAttemptProgress = (attemptId: number, progress: AttemptProgress): void => { ... }
export const removeAttemptProgress = (attemptId: number): void => { ... }
```

- `localStorage` の読み書きは `try / catch` で包む（プライベートブラウズ・容量超過で例外になるため。失敗しても画面は動かす）。`version` が違う・JSON が壊れているときは null
- 型は `@repo/api-schema` の型から作る（`source` は `SubmitAttemptRequest["word_lookups"][number]["source"]`）

## 動作確認

```bash
pnpm --filter web build
pnpm lint:fix
```

`verify-web-page` skill の手順で、`pnpm --filter api issue-test-token <userId>` のトークンを cookie に入れて確認する（公開中の問題を数件、DB に入れておく）。

- [ ] `/passages` に着地したまま（`/sign-in` に飛ばされない）、`console_messages` の error が 0 件
- [ ] 一覧がモックと同じ見た目（行・難易度メーター・挑戦状況の 3 種類）。スマホ幅（390px）で難易度などがタイトルの下の行に回る
- [ ] 種別・難易度・タグ・未挑戦のみを押すと URL のクエリが変わり、一覧と件数が変わる。URL を直接開いても同じ絞り込みになる。壊れたクエリ（`?difficulty=9`）でも画面が出る
- [ ] 21 件以上あるとき「さらに表示」で次の 20 件が後ろに足される。絞り込みを変えると 1 ページ目に戻る
- [ ] 0 件のとき空の状態が出て、「絞り込みを解除する」で全件に戻る
- [ ] 「ランダムに 1 問解く」で、絞り込み条件に合う問題の開始確認に移る
- [ ] 開始確認：新規は説明と「開始する」、挑戦中は琥珀の囲み（残り時間・回答数・期限）と「再開する」。下書きの問題の ID や `abc` は 404 の画面
- [ ] 「開始する」で `/attempts/{id}` に移る（解答画面は step6）。戻って同じ問題を開くと「再開する」になり、押すと同じ挑戦 ID に移る
- [ ] スクリーンショットを `docs/screenshots/reading-practice-list/after.png` に撮る（新規ページのため before なし）
