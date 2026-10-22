# step4-admin-collect-now

ソースの編集画面（GitHub のソース）の右に「今すぐ収集」のカード（ボタンと、最後の収集の状態・結果）を出す。cron の収集をやめたのに合わせて、試し実行のカードと「毎日の収集」の文言を直す。仕様と理由は [README](../README.md#収集の状態)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/admin/src/features/source/source.api.ts` | `requestCollection(id)`（`POST /api/admin/source/:id/collection-runs`） |
| `apps/admin/src/features/source/source.labels.ts` | 状態の表示名と色 |
| `apps/admin/src/app/(dashboard)/sources/actions.ts` | `requestSourceCollectionAction`。`createSourceAction` の JSDoc の「試し実行のコマンド（id 入り）を見せるため」 |
| `apps/admin/src/app/(dashboard)/sources/[id]/page.tsx` | 収集中の状態の値（`activeSourceCollectionRunStatusSchema.options`）を渡す。JSDoc の「GitHub のソースは試し実行のコマンドを出す」 |
| `apps/admin/src/components/features/source/SourceCollectionCard.tsx`（新規） | ボタン・状態の表示・収集中の読み直し |
| `apps/admin/src/components/features/source/SourceForm.tsx` | GitHub のときに、試し実行のカードの代わりに `SourceCollectionCard` を出す。「このソースを収集する」の説明を直す |
| `apps/admin/src/app/(dashboard)/sources/page.tsx` | 一覧の説明の文言 |
| `apps/admin/src/app/(dashboard)/url-import/actions.ts` | `github_source` の文言（「収集（collect:passages）で取り込んでください」） |
| `apps/admin/src/app/(dashboard)/mock/sources/**` | モックの試し実行のカードと一覧の説明（本番の画面に合わせる） |
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
export type SourceCollectionRun = NonNullable<GetSourceResponse["latest_collection_run"]>

export type SourceCollectionRunStatus = SourceCollectionRun["status"]

export const SOURCE_COLLECTION_RUN_STATUS_LABELS: Record<SourceCollectionRunStatus, { color: BadgeColor, label: string }> = {
  completed: { color: "success", label: "完了" },
  failed: { color: "error", label: "失敗" },
  limit_reached: { color: "warning", label: "上限で打ち切り" },
  queued: { color: "info", label: "収集中" },
  rate_limited: { color: "warning", label: "rate limit で打ち切り" },
  running: { color: "info", label: "収集中" },
  up_to_date: { color: "light", label: "変更なし" },
}

export type SourceCollectionRequestFailureReason = "disabled" | "failed" | "running" | "unavailable"

export const SOURCE_COLLECTION_REQUEST_FAILURE_MESSAGES: Record<SourceCollectionRequestFailureReason, string> = {
  disabled: "無効のソースは収集しません。有効にして保存してから押してください。",
  failed: "収集を始められませんでした。時間をおいてもう一度押してください。",
  running: "ほかの収集が実行中です。終わるまで待ってください。",
  unavailable: "この環境では今すぐ収集を使えません（worker がありません）。",
}
```

- `BadgeColor` は `components/ui/badge/Badge.tsx` から export し、`passage.labels.ts`・`url-import.labels.ts` の同じ型もそれを使う
- 「収集中か」は admin で値を書き写さず、Server Component（`sources/[id]/page.tsx`）が `activeSourceCollectionRunStatusSchema.options`（step2。`@repo/domain` の `ACTIVE_SOURCE_COLLECTION_RUN_STATUSES` から作る）を `activeStatuses` の props で渡し、カードは `activeStatuses.includes(run.status)` で判定する（`allowedLicenses` と同じ形）

### Server Action

```ts
export type SourceCollectionRequestResult = { ok: false, reason: SourceCollectionRequestFailureReason } | { ok: true }

export const requestSourceCollectionAction = async (sourceId: number): Promise<SourceCollectionRequestResult> => {
  const params = createSourceCollectionRunPathParamSchema.safeParse({ id: sourceId })
  if (!params.success) return { ok: false, reason: "failed" }
  const { id } = params.data
  try {
    await sourceApi.requestCollection(id)
  } catch (error) {
    unstable_rethrow(error)
    if (!(error instanceof ApiClientError)) throw error
    revalidatePath(`/sources/${id}`)
    return { ok: false, reason: convertCollectionRequestErrorToReason(error) }
  }
  revalidatePath(`/sources/${id}`)
  return { ok: true }
}
```

| status | reason |
| --- | --- |
| 409 | `running` |
| 400 | `disabled` |
| 404 | `unavailable` |
| ほか | `failed` |

- 引数は API のパスのスキーマで検証する（Server Action はブラウザから任意の値で呼べるため）

- 404 はソースが無いときにも返るが、編集画面を開けている（ソースがある）ので、ルートが無い（`SOURCE_COLLECTION_TYPE=none`）とみなす
- 失敗のときも `revalidatePath` する。409（別の管理者が先に押した）のとき、最新の記録が `queued` / `running` で返り、カードが「収集中」と 3 秒ごとの読み直しに切り替わるようにするため
- catch の先頭の `unstable_rethrow` は `createSourceAction` と同じ（`apps/admin/src/libs/api-client.ts` の JSDoc）

### カード

`SourceCollectionCard.tsx`（client component）：

```tsx
export function SourceCollectionCard({ activeStatuses, isEnabled, run, sourceId }: {
  activeStatuses: readonly SourceCollectionRunStatus[]
  isEnabled: boolean
  run: SourceCollectionRun | null
  sourceId: number
}) {
  const router = useRouter()
  const [failureReason, setFailureReason] = useState<SourceCollectionRequestFailureReason | null>(null)
  const [isPending, startTransition] = useTransition()
  const isActive = run !== null && activeStatuses.includes(run.status)

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
- ボタン：`isEnabled` が false・収集中・送信中は `disabled`。無効のときはボタンの下に `SOURCE_COLLECTION_REQUEST_FAILURE_MESSAGES.disabled`
- 状態：バッジ（`SOURCE_COLLECTION_RUN_STATUS_LABELS`）と、README の「収集の状態」の表の文（件数・時刻は `formatDateTime`）。`failed` は `run.error` を出す。記録が無ければ「まだ今すぐ収集をしていません」
- `failureReason` があればボタンの下に `SOURCE_COLLECTION_REQUEST_FAILURE_MESSAGES` の文。`running` は読み直しで収集中でなくなったら消し、`disabled` は無効の案内と同じ文なので出さない
- 「収集の状況」のカードの下に、試し実行のカードの代わりに「今すぐ収集」のカードとして置く。サイトのソースには出さない
- `isEnabled` は保存済みの値（`detail.source.is_enabled`）を渡す。フォームで切り替えただけ（未保存）では変わらない

### 文言

| 場所 | 変更前 | 変更後 |
| --- | --- | --- |
| ソース一覧の説明 | 英文の取得元。有効な GitHub のソースだけを毎日の収集（collect:passages）が取り込みます。 | 英文の取得元。GitHub のソースの編集画面の「今すぐ収集」で本文候補を取り込みます。 |
| 「このソースを収集する」の説明 | 無効にすると次回から収集しません。公開済みの問題は残ります。 | 無効にすると「今すぐ収集」を押せなくなります。公開済みの問題は残ります。 |
| URL から追加の `github_source` | このサイトは GitHub のソースで収集しています。収集（collect:passages）で取り込んでください。 | このサイトは GitHub のソースで収集しています。ソースの編集画面の「今すぐ収集」で取り込んでください。 |
| ソース一覧の空のとき | GitHub のリポジトリを登録すると、翌日の収集から本文候補が作られます。 | GitHub のリポジトリを登録し、編集画面の「今すぐ収集」で本文候補を作ります。 |

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
- [ ] 「試し実行」のカードが無い。一覧・URL から追加の文言に `collect:passages` が残っていない（`git grep -n "collect:passages\|試し実行" apps/admin` がモックの外に出ない）
- [ ] api を `SOURCE_COLLECTION_TYPE=none` で起動すると、押したときに「この環境では今すぐ収集を使えません」
- [ ] console の error が 0 件
