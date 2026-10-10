# step7-admin-audio-status

admin の問題の確認画面（`/passages/[id]`）に、読み上げの音声の状態（準備中・生成中・作成済み・失敗）と作成日時、失敗したときの「再試行」を足す。新しい画面は作らず、既存の admin の部品（`ComponentCard`・`Badge`）で組む。仕様は [README の音声ができるまで](../README.md#音声ができるまで)・[必要な画面](../README.md#必要な画面)。

## 前提

- [step4-api-attempt-audio](./step4-api-attempt-audio.md)（`GET /api/admin/passage/:id` の `audio`、`POST /api/admin/passage/:id/audio/retry`、`@repo/api-schema` の `retryAdminPassageAudioResponseSchema`）
- [question-generation step6-admin-passage-review](../../question-generation/tasks/step6-admin-passage-review.md)（`/passages/[id]`、`PassageReview`、`passage.api.ts`、`passage-labels.ts`、`actions.ts` の `PassageActionResult`）
- [question-generation step4-api-admin-auth](../../question-generation/tasks/step4-api-admin-auth.md)（api client の `X-Admin-Token` と `ApiClientError`）

## 対応内容

### 1. 表示の仕様

`detail.audio` が null（下書きなどで音声の行も無い）なら何も出さない。それ以外は、上部の生成の記録の下（囲みの案内の前）に 1 枚のカードを出す。

| `audio.status` | バッジ（`Badge` の `color`） | 本文 | 操作 |
| --- | --- | --- | --- |
| `pending` | 準備中（`light`） | 「公開から最大 1 時間で作成されます。」。`generated_at` があれば「前回の作成：YYYY-MM-DD HH:mm」（公開し直した後の確認待ち） | なし |
| `generating` | 生成中（`info`） | 「生成タスクが音声を作成しています。」。`generated_at` があれば前回の作成日時 | なし |
| `ready` | 作成済み（`success`） | 「作成日時：YYYY-MM-DD HH:mm」 | なし |
| `failed` | 失敗（`error`） | 「音声の作成に 3 回失敗しました。」と `last_error`（等幅・折り返し） | 「再試行」 |

- 日時は一覧と同じく Asia/Tokyo の `YYYY-MM-DD HH:mm`（step6 の整形の関数があれば使う）
- 下書きに戻した問題（音声の行がある）も同じカードを出す。再試行は状態を問わず `failed` なら押せる（生成されるのは再公開の後）

### 2. ラベル（`src/features/passage/passage-labels.ts` に足す）

`server-only` を付けないファイル（Client Component から使う）。キーは `AdminPassageDetail["audio"]` の `status` から型付けする（`@repo/api-schema` の型を使い、`@repo/domain` は import しない）。

```ts
/** 色は問題の状態のラベル（収集済み light・生成中 info）とそろえる */
export const AUDIO_STATUS_LABELS: Record<AdminPassageAudioStatus, { color: "error" | "info" | "light" | "success"; label: string }> = {
  failed: { color: "error", label: "失敗" },
  generating: { color: "info", label: "生成中" },
  pending: { color: "light", label: "準備中" },
  ready: { color: "success", label: "作成済み" },
}
```

`AdminPassageAudioStatus` は `NonNullable<GetAdminPassageResponse["audio"]>["status"]`。

### 3. API 呼び出し（`src/features/passage/passage.api.ts` に足す）

```ts
/** 失敗した読み上げの音声を pending に戻す。404 / 409 は ApiClientError の status で呼び出し側が見分ける */
export const retryAdminPassageAudio = async (id: number): Promise<RetryAdminPassageAudioResponse> => {
  const raw = await apiClient.post<unknown>(`/api/admin/passage/${id}/audio/retry`, {})
  return retryAdminPassageAudioResponseSchema.parse(raw)
}
```

### 4. Server Action（`src/app/(dashboard)/passages/[id]/actions.ts` に足す）

```ts
export async function retryPassageAudioAction(id: number): Promise<PassageActionResult>
```

- 成功したら ``revalidatePath(`/passages/${id}`)`` して `{ ok: true }`
- `ApiClientError` の 404 / 409 は `{ details: undefined, error, ok: false, status }` で返す（409 は「音声の状態が変わりました。画面を再読み込みしてください。」）。それ以外は throw（`global-error.tsx` に任せる）

### 5. カード（`src/components/features/passage/PassageAudioCard.tsx`）

```tsx
"use client"

type Props = {
  audio: NonNullable<GetAdminPassageResponse["audio"]>
  passageId: number
}

export function PassageAudioCard({ audio, passageId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const router = useRouter()
  const { color, label } = AUDIO_STATUS_LABELS[audio.status]

  function handleRetry() {
    setErrorMessage(null)
    startTransition(async () => {
      const result = await retryPassageAudioAction(passageId)
      if (!result.ok) {
        setErrorMessage(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <ComponentCard desc="公開した問題の本文を Amazon Polly で読み上げた音声" title="読み上げの音声">
      {/** バッジ・本文（§1 の表）・失敗時の last_error と「再試行」（isPending の間は無効で「再試行中…」）・errorMessage */}
    </ComponentCard>
  )
}
```

- 「再試行」のボタンの見た目は step6 の `src/libs/ui-classes.ts` の副ボタン（`outlineButtonClass`）
- `last_error` は `<pre className="whitespace-pre-wrap break-all font-mono text-theme-xs ...">` で出す（長いエラーで横にはみ出さないように）
- `PassageReview` の上部の `section` の直後に `{detail.audio && <PassageAudioCard audio={detail.audio} passageId={detail.id} />}` を置く。プレビューとタブの配置は変えない

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter admin lint
pnpm --filter admin build
```

admin にはユニットテストが無いので、`verify-web-page` skill の手順で Playwright MCP を使って実画面で確かめる（port 3030、Basic 認証あり）。api と DB を起動し、音声は [step3](./step3-cron-generate-audio.md) の `TTS_PROVIDER=fake pnpm --filter cron generate:audio` で作るか、`passage_audios` を psql で書き換えて状態を作る。PR には `docs/screenshots/read-aloud/{before,after}.png`（失敗の状態のカード）を添える。

- [ ] 公開中で音声の行が無い問題：「準備中」のバッジと「公開から最大 1 時間で作成されます。」
- [ ] `UPDATE passage_audios SET status = 'generating', generation_started_at = now()`：「生成中」のバッジが出て、「再試行」は出ない
- [ ] generate:audio を実行した後に再読み込み：「作成済み」と作成日時（Asia/Tokyo）
- [ ] `UPDATE passage_audios SET status = 'failed', attempt_count = 3, last_error = 'ServiceFailureException: ...'`：「失敗」のバッジ、エラーの文言、「再試行」が出る。長いエラーでもカードの幅からはみ出さない
- [ ] 「再試行」を押すと、押している間はボタンが無効になり、終わると「準備中」に変わる。DB が `pending`・`attempt_count = 0`
- [ ] 別のタブで先に再試行してから押すと、409 の文言が出る（画面は壊れない）
- [ ] 収集済み・下書き（音声の行が無い）の問題ではカードが出ない
- [ ] ブラウザに `ADMIN_API_TOKEN` が渡っていない（開発者ツールで確認）
