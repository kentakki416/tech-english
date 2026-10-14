# step4-web-mypage

web のマイページ `/`・学習履歴 `/history`・設定 `/settings` を、確定済みのモックから移植してダミーデータを API のデータに置き換える。共通ヘッダー（`AppHeader`）もここで本番に移す。デザインは [README の「UI 設計」](../README.md#ui-設計) と [product-overview の UI 設計](../../product-overview/README.md#ui-設計)。

## 前提

- [step2-api-user-stats](./step2-api-user-stats.md)・[step3-api-user-goal](./step3-api-user-goal.md)
- [github-auth step2-api-auth-github](../../github-auth/tasks/step2-api-auth-github.md)（`GET /api/user` の `timezone`、`PATCH /api/user`）
- [github-auth step3-web-github-login](../../github-auth/tasks/step3-web-github-login.md)（本番のログイン画面。フォントとダークの背景をルートのレイアウトに当てる）
- [reading-practice step5〜7](../../reading-practice/tasks/step5-web-passage-list.md)（`/passages`・`/passages/random`・`/attempts/[id]/result`、共通ヘッダーと共通部品）
- この step の後に [github-auth step6-web-delete-user](../../github-auth/tasks/step6-web-delete-user.md) が `/settings/delete-account` を作る

## 対応内容

### 移植の対応表

マークアップと class はモックをそのまま使い、`/mock/...` へのリンクを本番のパスに、`@/libs/mock-data` の値を API のレスポンスに置き換える。モックのファイルは消さない（取り決め 4）。

| 本番 | モック（`src/app/mock/`） |
| --- | --- |
| `src/app/page.tsx`（メモのサンプルのトップを置き換える） | `home/page.tsx` |
| `src/app/history/page.tsx` | `history/page.tsx` |
| `src/app/settings/page.tsx`・`actions.ts` | `settings/page.tsx` |
| `src/components/ui/AppHeader.tsx`・`ScoreSquares.tsx` | `_components/AppHeader.tsx`・`parts.tsx` の `ScoreSquares` |
| `src/components/features/learning-record/StudyCalendar.tsx` | `_components/StudyCalendar.tsx` |
| 同 `StreakPanel.tsx`・`GoalPanel.tsx`・`RecentAttempts.tsx`・`StudyTotals.tsx`・`TypeAccuracy.tsx`・`PrimaryActions.tsx`・`FirstStepGuide.tsx` | `home/page.tsx` の各区画 |
| 同 `HistoryList.tsx` | `history/page.tsx` の一覧 |
| 同 `GoalForm.tsx`・`TimezoneSelect.tsx` | `settings/SettingsForm.tsx` |
| `src/features/learning-record/learning-record.api.ts` | ― |
| `src/libs/format.ts` | `libs/mock-data.ts` の `formatSeconds` など |
| `src/components/features/passage/labels.ts`（`QUESTION_TYPE_LABELS`） | `libs/mock-data.ts` の設問の種類のラベル |
| `src/app/api/user/calendar/route.ts`・`src/app/api/user/attempts/route.ts` | ― |

ルートのレイアウト（フォント・ダークの背景）・`Wordmark`・本文リーダーは github-auth step3 が、`AppHeader`・`ScoreSquares`・`format.ts`・`labels.ts` は reading-practice step5 が本番に移してある（[実装の順番](../../product-overview/README.md#実装の順番)）。この step はそれを使い、`format.ts` に足りない関数（`formatStudyTime` など）を足す。上の表の `AppHeader` / `ScoreSquares` / `format.ts` / `labels.ts` の行は、既にあれば作らない。

### 共通の土台

- `AppHeader` は Server Component。`current: "history" | "home" | "passages" | "settings"` を受け、ナビは `/`・`/passages`・`/history`・`/settings`。右端は `getUser()` の `avatar_url` を `next/image` で出す（`next.config.ts` の `images.remotePatterns` に `avatars.githubusercontent.com` を足す）。`avatar_url` が無ければ名前の頭文字
- `src/features/user/get-user.ts` の `getUser` を React の `cache` で包み、ページとヘッダーで 1 回の取得にする

### API の呼び出し（`src/features/learning-record/learning-record.api.ts`）

```typescript
import "server-only"

/**
 * 学習記録と目標の API 通信層
 */
export const learningRecordApi = {
  getAttempts: async (query: { cursor?: number, date?: string } = {}): Promise<GetUserAttemptsResponse> => {
    const raw = await apiClient.get<unknown>(`/api/user/attempts?${buildSearchParams(query)}`)
    return getUserAttemptsResponseSchema.parse(raw)
  },
  /** 範囲を省略すると年表示（直近 53 週）の範囲を api が決める */
  getCalendar: async (range?: { from: string, to: string }): Promise<GetUserCalendarResponse> => { /** 同様 */ },
  getGoal: async (): Promise<GetUserGoalResponse> => { /** 同様 */ },
  getStats: async (): Promise<GetUserStatsResponse> => { /** 同様 */ },
  saveGoal: async (input: UpdateUserGoalRequest): Promise<UpdateUserGoalResponse> => {
    const raw = await apiClient.put<unknown>("/api/user/goal", input)
    return updateUserGoalResponseSchema.parse(raw)
  },
}
```

- `buildSearchParams` は値が `undefined` の項目を除いて `URLSearchParams` にする小さな関数（同じファイルに置く）
- タイムゾーンの変更は `src/features/user/user.api.ts` に `updateTimezone(timezone)` を作り、`PATCH /api/user` を呼ぶ。`src/libs/api-client.ts` に `patch` が無ければ `put` と同じ形で足す（キーはアルファベット順）
- `src/libs/format.ts`（`server-only` なし。Client Component からも使う）: `formatSeconds`（`m:ss`。reading-practice のタイマーも使う）、`formatStudyTime`（秒 → `9時間12分`）、`formatDayLabel`（`10月10日（土）`）、`formatDateHeading`（`2026年10月10日（土）`）、分の表示 `Math.ceil(study_seconds / 60)`（学習した日が「0 分」にならないように切り上げ）
- `src/components/features/passage/labels.ts` の `QUESTION_TYPE_LABELS`（reading-practice step5 が作成済み）を使う

### Route Handler（Client Component からの取得）

カレンダーの月の移動と日付の選択、履歴の続きの読み込みで使う。

```typescript
/** src/app/api/user/attempts/route.ts */
export const GET = async (req: NextRequest) => {
  const parsed = getUserAttemptsQueryStringSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 })

  try {
    return NextResponse.json(await learningRecordApi.getAttempts(parsed.data))
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch attempts" }, { status: error instanceof ApiClientError ? error.status : 500 })
  }
}
```

`src/app/api/user/calendar/route.ts` も同じ形で、`from` と `to` を必須にして `learningRecordApi.getCalendar({ from, to })` を呼ぶ。

### マイページ（`src/app/page.tsx`）

```tsx
export default async function HomePage() {
  const [user, stats, calendar] = await Promise.all([getUser(), learningRecordApi.getStats(), learningRecordApi.getCalendar()])
  const isEmpty = stats.totals.attempt_count === 0
  /** モックと同じ並び。aside（パネル）は lg 未満で order-first */
}
```

| モックの値 | API の値 |
| --- | --- |
| `MOCK_USER` | `user.name` / `user.avatar_url` |
| `streak` / `RECENT_DAYS` | `stats.streak.current` / `longest` / `recent_days`（`has_studied`。末尾が今日で、学習していれば光らせる） |
| `goal` | `stats.goal`（`null` なら「目標はまだありません。」と「目標を設定する」） |
| `totals` / `noAssistAccuracy` | `stats.totals`（`study_seconds` を `formatStudyTime`）/ `stats.no_assist.accuracy_percent` |
| `typeAccuracy` と「推論の設問が一番苦手です。」 | `stats.type_accuracy`（`null` は `—` と空の棒）/ `stats.weakest_question_type`（`null` なら出さない） |
| `MOCK_ATTEMPT_HISTORY.slice(0, 5)` | `stats.recent_attempts`（行は `/attempts/{id}/result`） |
| `createMockCalendar()` | `calendar` |

- 目標のパネル: `goal_text` / `target_date` / 週の目標は、値のある項目だけ出す。残り日数は `days_left >= 0` なら「あと N 日」、負なら「目標日を過ぎています」
- 今週の進捗: `{weekly_progress} / {weekly_target} 問`（`minutes` は `分`）。線は問題数で目標値が 10 以下ならモックどおり目標値の数だけ並べ、それ以外は 1 本の線を進捗の割合で塗る。`is_weekly_achieved` なら「今週の目標を達成しました。」、未達なら「あと N 問で今週の目標を達成します。」
- 正答率が 70% 未満の種類は `bg-amber/50`（モックどおり）
- 導線: 「問題一覧」→ `/passages`、「ランダムに 1 問解く」→ `/passages/random`（study-reminder の通知と同じ「ランダムに 1 問」の入口。reading-practice が受ける）
- まだ 1 問も解いていないとき（`isEmpty`）: モックの `state=empty` と同じ表示（`FirstStepGuide` にボタンを移す、統計と最近の挑戦を出さない、カレンダーは api が全日 level 0 で返す）

### 学習カレンダー（`StudyCalendar.tsx`、Client Component）

props は `initialCalendar: GetUserCalendarResponse`。見た目はモックのまま、データの作り方だけ変える。

- **年表示**: `initialCalendar.days` を `from` の曜日（月曜 0）の数だけ空のマスで前を埋めて 7 日ずつの列にする（api が 53 列に収まる範囲を返す）。今日は `initialCalendar.today`
- **月表示**: state の `month`（`YYYY-MM`、初期値は今日の月）。月初が `initialCalendar.from` 以降なら年表示のデータから切り出し、それより前は `/api/user/calendar?from={月初}&to={月末}` で取得する（月ごとに state に保持）。モックで省略している前後の月への移動ボタン（`‹` `›`）を見出しの横に足し、`›` は今月で無効。今日より後の日は薄くして押せない
- **選んだ日の挑戦**: `selectedDate`（初期値は今日）が変わるたびに `/api/user/attempts?date=` を取得する（`AbortController` で古いリクエストを捨てる）。見出しの「N 問、M 分」は選んだ日の `attempt_count` と `study_seconds`。行は提出時刻（`submitted_time`）・タイトル・正答数・`formatSeconds(elapsed_seconds)`、`/attempts/{id}/result` へのリンク

### 学習履歴（`src/app/history/page.tsx`）

- Server Component で `learningRecordApi.getAttempts()` の 1 ページ目を取り、`HistoryList`（Client Component）に `initialAttempts` / `initialNextCursor` を渡す
- `HistoryList` は `study_date` ごとに見出し（`formatDateHeading`）でまとめ、行はモックのまま（`is_overtime` はローズと「超過」、`used_assist` で「アシストあり / なし」）。`next_cursor` があれば一覧の下に「さらに表示」（副ボタン）を置き、`/api/user/attempts?cursor=` の結果を後ろに足す
- 1 件も無いときは「まだ提出した挑戦はありません。」と「問題一覧」（`/passages`）

### 設定（`src/app/settings/page.tsx`・`actions.ts`）

- Server Component で `getUser()`（`timezone`）と `learningRecordApi.getGoal()` を並列に取得し、タイムゾーンの候補は `Intl.supportedValuesOf("timeZone")`（現在の値が含まれなければ先頭に足す）
- 区画の順はモックどおり「目標 → タイムゾーン → リマインダー（案内の文だけ） → アカウント → 危険な操作」

```typescript
/** src/app/settings/actions.ts */
"use server"

export type GoalFormState = { message?: string, status: "error" | "idle" | "saved" }

const convertBlankToNull = (value: FormDataEntryValue | null): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

export const saveGoalAction = async (_prev: GoalFormState, formData: FormData): Promise<GoalFormState> => {
  const metric = formData.get("weekly_metric")
  const parsed = updateUserGoalRequestSchema.safeParse({
    goal_text: convertBlankToNull(formData.get("goal_text")),
    target_date: convertBlankToNull(formData.get("target_date")),
    weekly_metric: metric === "none" ? null : metric,
    weekly_target: metric === "none" ? null : Number(formData.get("weekly_target")),
  })
  if (!parsed.success) return { message: "入力内容を確認してください。", status: "error" }

  try {
    await learningRecordApi.saveGoal(parsed.data)
  } catch {
    return { message: "保存に失敗しました。時間をおいて再度お試しください。", status: "error" }
  }
  revalidatePath("/")
  revalidatePath("/settings")
  return { status: "saved" }
}
```

- `updateTimezoneAction(timezone: string)` も同じファイルに置き、`userApi.updateTimezone` → `revalidatePath("/")`・`revalidatePath("/settings")`
- `GoalForm`: `useActionState(saveGoalAction, { status: "idle" })`。モックの入力に `name`（`goal_text` / `target_date` / `weekly_target`）を付け、指標のセグメントの値は `<input type="hidden" name="weekly_metric">` で送る。初期値は `goal`（`null` なら空と「設定しない」）。`saved` なら「目標を保存しました」（`correct`）、入力を変えたら消す。`error` は `wrong` の文字で出す
- `TimezoneSelect`: 変更したらその場で `updateTimezoneAction` を呼び（`useTransition`）、成功したら横に「タイムゾーンを保存しました」（`correct`）
- ログアウト: 既存の `logoutAction`（`src/libs/auth-actions.ts`）を `<form action={logoutAction}>` で呼ぶ
- 危険な操作: 「アカウントを削除」は `/settings/delete-account` へのリンク（画面は github-auth step6）

### 片付け

- 旧トップでしか使っていない `src/components/features/user/refresh-button.tsx`・`user-bot-animation.tsx` は削除する。`/memos` は残す（product-overview の「削除するかは別途判断」）

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter web build
pnpm lint:fix
```

`verify-web-page` skill で実画面を確認する（JWT を cookie に注入。console の error が 0 件）。データは「挑戦 0 件のユーザー」と「提出済みの挑戦があるユーザー」（reading-practice の画面で提出するか、psql で `reading_attempts` に `submitted` の行を入れる）の 2 人で見る。

- [ ] `/` が `/sign-in` に飛ばされずに表示され、連続日数・目標・カレンダー・累計・種類別・最近の挑戦が API の値になっている
- [ ] 挑戦 0 件のユーザーで「最初の 1 問を解いてみましょう」が出て、統計と最近の挑戦が出ない
- [ ] 年表示が右端（今日）までスクロールされ、今日のマスが光る。月表示で前の月に移動でき、1 年より前の月は取得して表示される。`›` は今月で無効
- [ ] 日付を選ぶとその日の挑戦が出る。学習していない日は「この日の学習はありません。」
- [ ] `/history` が日付ごとにまとまり、21 件以上あるとき「さらに表示」で続きが足される
- [ ] `/settings` で目標を保存すると「目標を保存しました」が出て、`/` の目標のパネルに反映される。指標だけ選んで値を空にするとエラーが出る
- [ ] タイムゾーンを変えると保存され、再読み込みしても選んだ値のまま
- [ ] ログアウトで `/sign-in` に戻る
- [ ] 1024px 未満でパネルがカレンダーより先に並び、640px 未満でヘッダーのナビが 2 段目になる
- [ ] スクリーンショットを `docs/screenshots/learning-record/` に撮り、PR に添える（新規ページのため before なし。トップは置き換えなので before も撮る）
