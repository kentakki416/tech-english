# step5-admin-collect-now

ソースの編集画面（GitHub のソース）の「収集の状況」に「今すぐ収集」のボタンと、最後の今すぐ収集の状態・結果を出す。仕様と理由は [README](../README.md#収集の状態)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/admin/src/features/source/source.api.ts` | `requestCollection(id)`（`POST /api/admin/source/:id/collection-runs`） |
| `apps/admin/src/features/source/source.labels.ts` | 状態の表示名と色 |
| `apps/admin/src/app/(dashboard)/sources/actions.ts` | `requestSourceCollectionAction` |
| `apps/admin/src/components/features/source/SourceCollectionCard.tsx`（新規） | ボタン・状態の表示・収集中の読み直し |
| `apps/admin/src/components/features/source/SourceForm.tsx` | 右の「収集の状況」の GitHub のときに `SourceCollectionCard` を使う |
| `apps/admin/CLAUDE.md` | `/sources/[id]` の行に今すぐ収集 |
| `docs/screenshots/manual-collection/` | 編集画面の before / after |

### API の通信

```ts
  requestCollection: async (id: number): Promise<CreateSourceCollectionRunResponse> => {
    const raw = await apiClient.post<unknown>(`${BASE_PATH}/${id}/collection-runs`, {})
    return createSourceCollectionRunResponseSchema.parse(raw)
  },
```

### 状態の表示名

`source.labels.ts`：

```ts
type SourceCollectionRunStatus = NonNullable<GetSourceResponse["latest_collection_run"]>["status"]

export const SOURCE_COLLECTION_RUN_STATUS_LABELS: Record<SourceCollectionRunStatus, { color: BadgeColor; label: string }> = {
  completed: { color: "success", label: "完了" },
  failed: { color: "error", label: "失敗" },
  limit_reached: { color: "warning", label: "上限で打ち切り" },
  queued: { color: "info", label: "収集中" },
  rate_limited: { color: "warning", label: "rate limit で打ち切り" },
  running: { color: "info", label: "収集中" },
  up_to_date: { color: "light", label: "変更なし" },
}

export const isSourceCollectionRunActive = (status: SourceCollectionRunStatus): boolean =>
  status === "queued" || status === "running"
```

- `BadgeColor` は `url-import.labels.ts` と同じ型（共通にできるなら 1 か所に移す）

### Server Action

```ts
export type SourceCollectionRequestState = { message?: string }

export const requestSourceCollectionAction = async (sourceId: number): Promise<SourceCollectionRequestState> => {
  try {
    await sourceApi.requestCollection(sourceId)
  } catch (error) {
    if (error instanceof ApiClientError) return { message: buildCollectionRequestErrorMessage(error.status) }
    throw error
  }
  revalidatePath(`/sources/${sourceId}`)
  return {}
}
```

| status | 文言 |
| --- | --- |
| 409 | ほかの収集が実行中です。終わるまで待ってください |
| 400 | 無効のソースは収集しません。有効にして保存してから押してください |
| 404 | この環境では今すぐ収集を使えません（worker がありません）。毎日の収集を待つか、cron を手動で実行してください |
| ほか | 収集を始められませんでした。時間をおいてもう一度押してください |

- 404 はソースが無いときにも返るが、編集画面を開けている（ソースがある）ので、ルートが無い（`SOURCE_COLLECTION_TYPE=none`）とみなす

### カード

`SourceCollectionCard.tsx`（client component）：

```tsx
export function SourceCollectionCard({ isEnabled, run, sourceId }: { isEnabled: boolean; run: SourceCollectionRun | null; sourceId: number }) {
  const router = useRouter()
  const [state, setState] = useState<SourceCollectionRequestState>({})
  const [isPending, startTransition] = useTransition()
  const isActive = run !== null && isSourceCollectionRunActive(run.status)

  useEffect(() => {
    if (!isActive) return
    const timer = setInterval(() => router.refresh(), COLLECTION_RUN_REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isActive, router])

  return (
    ...
  )
}
```

- `COLLECTION_RUN_REFRESH_INTERVAL_MS = 3000`
- ボタン：`isEnabled` が false・収集中・送信中は `disabled`。無効のときはボタンの下に「無効のソースは収集しません。有効にして保存してから押してください」
- 状態：バッジ（`SOURCE_COLLECTION_RUN_STATUS_LABELS`）と、README の「収集の状態」の表の文（件数・時刻は `formatDateTime`）。`failed` は `run.error` を出す。記録が無ければ「まだ今すぐ収集をしていません」
- `state.message` があればボタンの下にエラーの文
- 「収集の状況」のカードの中（最終収集・取り込んだコミット・本文候補の件数の下）に置く。サイトのソースには出さない
- `isEnabled` は保存済みの値（`detail.source.is_enabled`）を渡す。フォームで切り替えただけ（未保存）では変わらない

## 動作確認

```bash
pnpm --filter admin exec tsc --noEmit
pnpm lint:fix
pnpm dev
```

`verify-web-page` skill で確かめる（before は main の編集画面）。

- [ ] 有効な GitHub のソースで押すと「収集中」になり、数秒後に「完了：文書 M 件を取得、本文候補 N 件を作成」に変わる。本文候補の件数のバッジも増える
- [ ] 続けてもう一度押すと「変更なし」
- [ ] 収集中はボタンを押せない。2 つのタブで同時に押すと、片方は 409 の文言
- [ ] 無効のソースではボタンを押せず、案内が出る
- [ ] サイトのソースにはボタンが出ない
- [ ] api を `SOURCE_COLLECTION_TYPE=none` で起動すると、押したときに「この環境では今すぐ収集を使えません」
- [ ] console の error が 0 件
