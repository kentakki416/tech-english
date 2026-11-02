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
export type SourceDeleteFailureReason = "blocked" | "failed" | "not_found"

export const SOURCE_DELETE_FAILURE_MESSAGES: Record<SourceDeleteFailureReason, string> = {
  blocked: "公開中の問題、解答の記録、音声のいずれかがあるか、収集中のため削除できません。",
  failed: "削除に失敗しました。時間をおいて再度お試しください。",
  not_found: "このソースはすでに削除されています。",
}
```

`apps/admin/src/app/(dashboard)/sources/actions.ts`：

```ts
export type SourceDeleteResult = { ok: false, reason: SourceDeleteFailureReason } | { ok: true }

const convertDeleteErrorToReason = (error: ApiClientError): SourceDeleteFailureReason => {
  if (error.status === 409) return "blocked"
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
  return { ok: true }
}
```

### モーダル

`apps/admin/src/components/features/source/SourceDeleteModal.tsx` を `TagDeleteModal` と同じ形で作る。

```tsx
const findDeletionBlockMessage = (source: SourceListItem, activeStatuses: readonly SourceCollectionRunStatus[]): string | null => {
  if (source.passage_counts.published > 0) return `公開中の問題が ${source.passage_counts.published} 件あるため削除できません。`
  if (source.latest_collection_run !== null && activeStatuses.includes(source.latest_collection_run.status)) {
    return "収集中のため削除できません。終わってからもう一度お試しください。"
  }
  return null
}
```

- 理由があるときは理由を出し、「削除する」を出さない
- 無いときは本文候補の件数と下書きの件数、取り消せないことを出す
- 409・404 のあとは「削除する」を消す

### 一覧

`SourceTable.tsx` の `EDIT_COLUMN` と `COLUMNS` を、`TagTable` の `buildColumns` と同じ形でコールバックを受ける関数にする。「編集」の横に `aria-label` つきの「削除」のボタンを置き、開いているソースを state に持つ。

## 動作確認

verify-web-page の手順で確認する。実際に消すのは確認用に入れたソースだけにする。

- 公開中の問題があるソースで「削除」を押すと理由が出て、「削除する」が無い
- 確認用のソースで「削除する」を押すと、モーダルが閉じて一覧から消える
- 「キャンセル」で閉じると何も変わらない
- console error が 0 件
