# step2: ソース一覧の削除ボタンと確認のモーダル

ソース一覧の「編集」の横に「削除」を足し、確認のモーダルから step1 の API を呼ぶ。方針は [README](../README.md#画面の事前の判定)。

## 対応内容

### 通信と Server Action

`apps/admin/src/features/source/source.api.ts`：

```ts
delete: async (id: number): Promise<void> => {
  await apiClient.delete(`${BASE_PATH}/${id}`)
},
```

`apps/admin/src/features/source/source.labels.ts`：

```ts
export type SourceDeleteFailureReason = "collecting" | "failed" | "not_found"

export const SOURCE_DELETE_FAILURE_MESSAGES: Record<SourceDeleteFailureReason, string> = {
  collecting: "収集中のため削除できません。終わってからもう一度お試しください。",
  failed: "削除に失敗しました。時間をおいて再度お試しください。",
  not_found: "このソースはすでに削除されています。",
}
```

`apps/admin/src/app/(dashboard)/sources/actions.ts`：

```ts
export type SourceDeleteResult = { ok: false, reason: SourceDeleteFailureReason } | { ok: true }

const convertDeleteErrorToReason = (error: ApiClientError): SourceDeleteFailureReason => {
  if (error.status === 409) return "collecting"
  if (error.status === 404) return "not_found"
  return "failed"
}

export const deleteSourceAction = async (sourceId: number): Promise<SourceDeleteResult> => {
  const params = deleteSourcePathParamSchema.safeParse({ id: sourceId })
  if (!params.success) return { ok: false, reason: "failed" }

  try {
    await sourceApi.delete(params.data.id)
  } catch (error) {
    unstable_rethrow(error)
    if (!(error instanceof ApiClientError)) throw error
    revalidatePath("/sources")
    return { ok: false, reason: convertDeleteErrorToReason(error) }
  }
  revalidatePath("/sources", "layout")
  revalidatePath("/tags")
  revalidatePath("/passages")
  return { ok: true }
}
```

### モーダル

`apps/admin/src/components/features/source/SourceDeleteModal.tsx` を `TagDeleteModal` と同じ形で作る。

```tsx
const buildPassageImpactMessage = (counts: SourceListItem["passage_counts"]): string => {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  if (total === 0) return "このソースに本文候補はありません。"
  const details = [
    ...(counts.published > 0 ? [`公開中 ${counts.published} 件`] : []),
    ...(counts.draft > 0 ? [`下書き ${counts.draft} 件`] : []),
  ]
  const detail = details.length > 0 ? `（${details.join("・")}を含む）` : ""
  return `本文候補 ${total} 件${detail}と、その解答の記録・音声も一緒に消えます。`
}
```

- 収集中は理由を出し、「削除する」を出さない
- 公開中の問題があれば、学習者の画面から消えることを赤い文字で出す
- 本文候補の件数と、取り消せないことを出す
- 404 のあとは「削除する」を消す。409 は収集が終わるまで消す
- Server Action 自体の失敗（通信エラーなど）は `failed` にして再試行できるようにする
- `SourceTable` は読み直した最新の行をモーダルに渡す。行が無くなったら開いた時点の行のまま理由を出す

### 一覧

`SourceTable.tsx` の `EDIT_COLUMN` と `COLUMNS` を、`TagTable` の `buildColumns` と同じ形でコールバックを受ける関数にする。「編集」の横に `aria-label` つきの「削除」のボタンを置き、開いているソースを state に持つ。

## 動作確認

verify-web-page の手順で確認する。実際に消すのは確認用に入れたソースだけにする。

- 公開中の問題があるソースで「削除」を押すと、学習者の画面から消えることが赤い文字で出る
- 収集中のソースで「削除」を押すと理由が出て、「削除する」が無い
- 確認用のソースで「削除する」を押すと、モーダルが閉じて一覧から消える
- 「キャンセル」で閉じると何も変わらない
- console error が 0 件
