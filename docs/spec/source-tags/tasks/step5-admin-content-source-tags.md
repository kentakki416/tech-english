# step5-admin-content-source-tags

ソースの登録・編集フォームの技術タグを、カンマ区切りの入力から「登録済みのタグを押して選ぶ」形に変え、ソースの一覧に色付きのタグを出す。仕様は [README のソースへのタグ付け](../README.md#ソースへのタグ付け)。

## 前提

- [step3-api-content-source-tags](./step3-api-content-source-tags.md)：ソースの登録・更新のリクエストが `tag_ids: number[]`、詳細の `source.tags` と一覧の各ソースの `tags` が `{ id, name, color }[]`
- [step4-admin-tags](./step4-admin-tags.md)：`tagApi`・`TagChip`（`isMuted`）・`/tags` の画面

## 対応内容

### ファイルの一覧

| ファイル | 内容 |
| --- | --- |
| `src/components/features/content-source/TagPicker.tsx` | 登録済みのタグを押して選ぶ部品（新規） |
| `src/components/features/content-source/SourceForm.tsx` | 技術タグの入力を `TagPicker` に変える。props に `tags` を足す（変更） |
| `src/features/content-source/content-source.form.ts` | `tags`（カンマ区切り）→ `tag_ids`（変更） |
| `src/app/(dashboard)/content-sources/new/page.tsx`・`[id]/page.tsx` | タグの一覧を取って `SourceForm` に渡す（変更） |
| `src/components/features/content-source/SourceTable.tsx` | 「ソース」の列の名前・リポジトリの下にタグを並べる（変更） |
| `src/app/(dashboard)/layout.tsx`・`src/components/ui/table/DataTable.tsx` | メインの領域に `min-w-0`、表を包む要素に `overflow-x-auto` を足し、表が長くなっても画面が横にはみ出さず、表の中で横にスクロールするようにする（変更） |
| `apps/admin/CLAUDE.md` | 「接続済みの画面」のソースの行に `TagPicker` を足す（変更） |

デザインモック（`app/(dashboard)/mock/content-sources/**`）は変えない。モックは `@/libs/mock-data` の独自の型（`tags: string[]`）を使っていて `@repo/api-schema` の型に依存しないので、型エラーにならない（全画面の本実装の後にまとめて消す）。

### `TagPicker`

- 登録済みのタグを全部 `TagChip` で並べ、押すたびに選ぶ・外すを切り替える。選んだものは普通の色、選んでいないものは `isMuted`（薄く）
- 選んだ id は `<input name="tag_ids" type="hidden">` を id ごとに置いてフォームに乗せる（`SourceForm` は `onSubmit` で `new FormData(form)` を作るので、hidden の input がそのまま送られる）
- 10 個選んだら、選んでいないタグは押せない（`disabled`）。下に「3 / 10 個を選択中」
- タグが 1 つも無ければ、チップの代わりに「タグがまだありません。」と `/tags` へのリンク
- 並びは渡された順（API の名前の順）。選んでも並び替えない（押した場所が動かないように）

```tsx
/** apps/admin/src/components/features/content-source/TagPicker.tsx */
"use client"

import Link from "next/link"
import { useState } from "react"

import type { GetTagListResponse } from "@repo/api-schema"

import { TagChip } from "@/components/features/tag/TagChip"
import { hintClass } from "@/libs/ui-classes"

type TagOption = GetTagListResponse["tags"][number]

/**
 * 1 ソースに付けられるタグの数（@repo/api-schema の tag_ids の上限と同じ。Client Component で Zod のスキーマを import しないため値を書く）
 */
const MAX_SOURCE_TAGS = 10

/**
 * ソースの技術タグの選択。選んだ id は hidden の input（name="tag_ids"）でフォームに乗せる
 */
export function TagPicker({ defaultSelectedIds, tags }: { defaultSelectedIds: number[], tags: TagOption[] }) {
  const [selectedIds, setSelectedIds] = useState<number[]>(defaultSelectedIds)

  if (tags.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        タグがまだありません。
        <Link className="font-medium text-brand-500 hover:text-brand-600" href="/tags">タグの画面</Link>
        で追加してください。
      </p>
    )
  }

  const isFull = selectedIds.length >= MAX_SOURCE_TAGS
  const toggleTag = (id: number) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]))

  return (
    <div>
      {selectedIds.map((id) => <input key={id} name="tag_ids" type="hidden" value={id} />)}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedIds.includes(tag.id)
          return (
            <button
              key={tag.id}
              disabled={!isSelected && isFull}
              aria-pressed={isSelected}
              className="rounded-full focus-visible:ring-3 focus-visible:ring-brand-500/20 focus-visible:outline-hidden disabled:cursor-not-allowed"
              onClick={() => toggleTag(tag.id)}
              type="button"
            >
              <TagChip color={tag.color} isMuted={!isSelected} name={tag.name} />
            </button>
          )
        })}
      </div>
      <p className={hintClass}>{selectedIds.length} / {MAX_SOURCE_TAGS} 個を選択中</p>
    </div>
  )
}
```

### `SourceForm`

- props に `tags: GetTagListResponse["tags"]`（登録済みのタグ全部）を足す
- 「基本情報」の技術タグの `Field` を差し替える。エラーのキーは `tag_ids`（Zod の `flatten().fieldErrors` のキー）。入力欄ではないので `htmlFor` は付けない

```tsx
/** apps/admin/src/components/features/content-source/SourceForm.tsx（技術タグの Field） */
<Field error={getFieldError("tag_ids")} hint="ユーザーの問題一覧の絞り込みに使います。タグはタグの画面で登録します。" label="技術タグ">
  <TagPicker defaultSelectedIds={source?.tags.map((tag) => tag.id) ?? []} tags={tags} />
</Field>
```

```tsx
export function SourceForm({
  allowedLicenses,
  detail,
  tags,
}: {
  allowedLicenses: readonly string[]
  detail: GetContentSourceResponse | null
  tags: GetTagListResponse["tags"]
}) {
  /** 中身は技術タグの Field のほか変えない */
}
```

- `TagPicker` の選択は `TagPicker` の state に持つ。`SourceForm` は `<form action>` でなく `onSubmit` から送るので、入力エラーで戻ってきても選択は消えない

### FormData の変換

```ts
/** apps/admin/src/features/content-source/content-source.form.ts */

/**
 * 同じ name の hidden の input（タグの選択）の id。数値にできない値は NaN のまま残し、Zod に弾かせる
 */
const getIds = (formData: FormData, key: string): number[] =>
  formData.getAll(key).map((value) => (typeof value === "string" && value !== "" ? Number(value) : Number.NaN))

export const convertFormDataToContentSourceRequest = (formData: FormData): Record<string, unknown> => {
  const fetchType = getText(formData, "fetch_type")
  const common = {
    exclude_globs: splitLines(formData, "exclude_globs"),
    fetch_type: fetchType,
    include_globs: splitLines(formData, "include_globs"),
    is_enabled: getText(formData, "is_enabled") === "true",
    kind: getChoice(formData, "kind"),
    license_spdx: getChoice(formData, "license_spdx"),
    license_url: getText(formData, "license_url").trim(),
    name: getText(formData, "name"),
    tag_ids: getIds(formData, "tag_ids"),
  }
  /** 以降（取得方法ごとの項目）は変えない */
}
```

- `splitComma` は技術タグにしか使っていないので消す
- 送られる id の重複・上限（10）・存在しない id は、`createContentSourceRequestSchema` / `updateContentSourceRequestSchema` と api（400）が検証する。存在しない id の 400（別のタブでタグを消した直後に保存した場合）は、`actions.ts` の今の扱いだと更新は「取得元の変更」の文言になってしまうので、次を直す

### Server Action の 400 の見分け

`updateContentSourceAction` は「フォームの値は検証済みなので API の 400 は取得元の変更」としているが、`tag_ids` に消したタグが混ざる 400 も起きるようになる。api のエラーボディ（`errorResponseSchema` の `details`）の `path` で見分ける。

```ts
/** apps/admin/src/app/(dashboard)/content-sources/actions.ts */

const MISSING_TAG_MESSAGE = "選んだタグのうち、削除されたものがあります。画面を再読み込みしてタグを選び直してください。"

/**
 * API の 400 が、存在しないタグの id（tag_ids）によるものか。details の path で見分ける（step3 の api が path: ["tag_ids"] を付ける）
 */
const isMissingTagError = (error: ApiClientError): boolean => {
  const body = errorResponseSchema.safeParse(error.body)
  return body.success && (body.data.details ?? []).some((detail) => detail.path[0] === "tag_ids")
}
```

- `createContentSourceAction` と `updateContentSourceAction` の両方で、400 かつ `isMissingTagError` なら `{ errors: { tag_ids: [MISSING_TAG_MESSAGE] } }` を返す。更新のそれ以外の 400 は今までどおり `ORIGIN_LOCKED_MESSAGE`
- 400 の `details` の形（`path: ["tag_ids"]`）は step3 の api と揃える

### ページ

```tsx
/** apps/admin/src/app/(dashboard)/content-sources/new/page.tsx */
export default async function NewContentSourcePage() {
  /**
   * タグの一覧をリクエストごとに API から取る（build 時に静的生成させない）
   */
  await connection()
  const { tags } = await tagApi.getList()

  return (
    <>
      <PageBreadcrumb pageTitle="ソースの登録" />
      <SourceForm allowedLicenses={allowedLicenseSchema.options} detail={null} tags={tags} />
    </>
  )
}
```

```tsx
/** apps/admin/src/app/(dashboard)/content-sources/[id]/page.tsx */
export default async function EditContentSourcePage({ params }: Props) {
  const { id } = await params
  const [detail, { tags }] = await Promise.all([loadContentSource(id), tagApi.getList()])

  return (
    <>
      <PageBreadcrumb pageTitle={`ソースの編集：${detail.source.name}`} />
      <SourceForm allowedLicenses={allowedLicenseSchema.options} detail={detail} tags={tags} />
    </>
  )
}
```

### ソースの一覧

`SourceTable` の「ソース」の列（名前・リポジトリ）の下に、タグを `flex flex-wrap gap-1` の行で `TagChip` を並べて出す。タグが無いソースは何も出さない。別の「タグ」の列にすると 1440px の幅で表がはみ出したため、ソースの列の中に入れた。

```tsx
/** apps/admin/src/components/features/content-source/SourceTable.tsx（「ソース」の列の render の中） */
{row.tags.length > 0 && (
  <div className="mt-1.5 flex flex-wrap gap-1">
    {row.tags.map((tag) => <TagChip key={tag.id} color={tag.color} name={tag.name} />)}
  </div>
)}
```

- 検索（`search.filterKeys`）と Filter は変えない（タグでの絞り込みは要望が出てから）
- レイアウト（`(dashboard)/layout.tsx`）のメインの領域に `min-w-0` を足し、`DataTable` の表を `<div className="overflow-x-auto">` で包む。これで幅の狭い画面では表が中で横にスクロールし、ページ全体は横にはみ出さない

### `apps/admin/CLAUDE.md`

「接続済みの画面」の `/content-sources/new`・`/content-sources/[id]` の行の実装に「技術タグの選択は `TagPicker`（選んだ id を hidden の `tag_ids` で送る）」を足す。

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter admin build
pnpm lint:fix
```

api（step3 まで入ったもの）と admin を起動し、`verify-web-page` skill の手順で Playwright MCP を使って確かめる（port 3030）。before のスクリーンショットは、この step の変更を入れる前に撮っておく。

- [ ] `/content-sources/new`：登録済みのタグが色付きで並び、押すと選ぶ・外すが切り替わる（選んでいないものは薄い）。「N / 10 個を選択中」が変わる
- [ ] 10 個選ぶと、残りのタグが押せなくなる。1 つ外すとまた押せる
- [ ] タグを選んで登録すると、編集画面でそのタグが選ばれた状態で出る
- [ ] `/content-sources/{id}`：今のタグが選ばれた状態で出る。付け替えて保存すると一覧に反映される
- [ ] 入力エラー（表示名を空にする）で戻ってきても、タグの選択が残っている
- [ ] タグを 1 つ選んだ編集画面を開いたまま、別のタブでそのタグを消してから保存すると、技術タグの欄の下に「選んだタグのうち、削除されたものがあります。…」が出る
- [ ] タグが 0 件のとき（全部消した状態）は「タグがまだありません。タグの画面で追加してください。」が出て、リンクで `/tags` に飛べる
- [ ] `/content-sources`：各行のソース名の下にタグが色付きで出る。タグが無いソースは何も出ない
- [ ] `/tags` でタグの名前・色を変えた後、`/content-sources` と編集画面のそのタグの表示が変わっている
- [ ] ライトとダークの両方で、選んだ・選んでいないタグの区別がつく
- [ ] `browser_console_messages` の error が 0 件
- [ ] スクリーンショット：登録フォームと一覧の before / after を `docs/screenshots/source-tags/before-source-form.png`・`after-source-form.png`・`before-source-list.png`・`after-source-list.png` に撮って PR に載せる
