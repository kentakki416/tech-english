# step4-admin-tags

admin にタグの画面（`/tags`）を足し、サイドバーに「タグ」を足す。色付きのタグの共通コンポーネント `TagChip` もここで作り、[step5](./step5-admin-content-source-tags.md) のソースの画面でも使う。仕様は [README のタグの管理](../README.md#タグの管理)・[タグの名前](../README.md#タグの名前)・[タグの色](../README.md#タグの色)。

## 前提

- [step2-api-admin-tag](./step2-api-admin-tag.md)：`/api/admin/tag` の CRUD と、`@repo/api-schema` の `admin/tag.ts`（`tagColorSchema`・`getTagListResponseSchema`・`createTagRequestSchema`・`updateTagRequestSchema`、レスポンスと型）。削除は 204（ボディなし）を返す
- admin の画面の作り方は `apps/admin/CLAUDE.md` の「API 接続の下地」。`@repo/*` のうち admin が import できるのは `@repo/api-schema` だけ（`@repo/eslint-config/frontend-boundary`）。色の型も `@repo/api-schema` から取る
- 見た目の細部（色の濃さ・余白）は `design-mock` skill で確定したら合わせる。ここでは構造と振る舞いを決める

## 対応内容

### ファイルの一覧

| ファイル | 内容 |
| --- | --- |
| `src/libs/api-client.ts` | `delete` が 204（ボディなし）を返せるようにする（変更） |
| `src/features/tag/tag.api.ts` | タグの API の呼び出し（新規） |
| `src/app/(dashboard)/tags/page.tsx` | タグの画面（新規） |
| `src/app/(dashboard)/tags/actions.ts` | 作成・更新・削除の Server Action（新規） |
| `src/components/features/tag/TagChip.tsx` | 色付きのタグ。色の名前 → Tailwind のクラスの対応表を持つ唯一の場所（新規） |
| `src/components/features/tag/TagTable.tsx` | 一覧の表と、追加・編集・削除のモーダルの開閉（新規） |
| `src/components/features/tag/TagFormModal.tsx` | 追加・編集のモーダル（新規） |
| `src/components/features/tag/TagDeleteModal.tsx` | 削除の確認のモーダル（新規） |
| `src/components/layout/AppSidebar.tsx` | 「タグ」を足す（変更） |
| `apps/admin/CLAUDE.md` | 「接続済みの画面」の表に `/tags` を足す（変更） |

### `apiClient.delete` の 204

今の `delete` は必ず `res.json()` するので、204（ボディなし）で例外になる。web の `api-client.ts` の `readJson` と同じく、204 なら `undefined` を返す。

```ts
/** apps/admin/src/libs/api-client.ts */

/**
 * 204（ボディなし）は undefined にする（削除の API が返す）
 */
const readJson = async <T>(res: Response): Promise<T> =>
  (res.status === 204 ? undefined : await res.json()) as T

export const apiClient = {
  delete: async <T = unknown>(path: string): Promise<T> => {
    const res = await requestApi(path, "DELETE")
    return readJson<T>(res)
  },
  /** get / post / put は変えない */
}
```

### API の呼び出し層

`content-source.api.ts` と同じ書き方。メソッド名も揃える（一覧は `getList`）。

```ts
/** apps/admin/src/features/tag/tag.api.ts */
import "server-only"

import {
  type CreateTagRequest,
  type CreateTagResponse,
  createTagResponseSchema,
  type GetTagListResponse,
  getTagListResponseSchema,
  type UpdateTagRequest,
  type UpdateTagResponse,
  updateTagResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

const BASE_PATH = "/api/admin/tag"

/**
 * タグの API 通信層。404 / 409 は apiClient の ApiClientError（status）で呼び出し側が見分ける
 */
export const tagApi = {
  create: async (input: CreateTagRequest): Promise<CreateTagResponse> => {
    const raw = await apiClient.post<unknown>(BASE_PATH, input)
    return createTagResponseSchema.parse(raw)
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_PATH}/${id}`)
  },

  getList: async (): Promise<GetTagListResponse> => {
    const raw = await apiClient.get<unknown>(BASE_PATH)
    return getTagListResponseSchema.parse(raw)
  },

  update: async (id: number, input: UpdateTagRequest): Promise<UpdateTagResponse> => {
    const raw = await apiClient.put<unknown>(`${BASE_PATH}/${id}`, input)
    return updateTagResponseSchema.parse(raw)
  },
}
```

### `TagChip`

- 色の名前ごとのクラスを **そのまま書いた対応表** を持つ。Tailwind はソースに書かれたクラス名しか CSS にしないので、`` `bg-${color}-50` `` のように組み立てない
- 対応表の型を `Record<TagColor, ...>` にして、`TAG_COLORS` に色を足したら型エラーで気づけるようにする。`TagColor` は `@repo/api-schema` のレスポンスの型から取る（admin は `@repo/domain` を import できない）
- Tailwind の既定のパレット（`rose`・`emerald` など）は admin の `globals.css` の `@theme` で消していない（`--color-*: initial` が無い）。`pink`・`sky`・`blue` は既に admin で使っていて `eslint-plugin-tailwindcss` の `no-custom-classname` に引っかかっていない。ほかの色で警告が出たら `globals.css` の冒頭のコメントの手順で直す
- `isMuted` は step5 のタグの選択で「選んでいない」を薄く出すため

```tsx
/** apps/admin/src/components/features/tag/TagChip.tsx */
import type { GetTagListResponse } from "@repo/api-schema"

export type TagColor = GetTagListResponse["tags"][number]["color"]

/**
 * 色ごとのクラス。chip はタグ（ライト：薄い背景と濃い文字、ダーク：半透明の背景と明るい文字）、swatch は色の見本の丸。
 * Tailwind はソースに書かれたクラス名しか CSS にしないため、色ごとにクラス名をそのまま書く
 */
export const TAG_COLOR_CLASSES: Record<TagColor, { chip: string, swatch: string }> = {
  amber: { chip: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30", swatch: "bg-amber-500" },
  blue: { chip: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:ring-blue-500/30", swatch: "bg-blue-500" },
  emerald: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30", swatch: "bg-emerald-500" },
  lime: { chip: "bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-500/15 dark:text-lime-400 dark:ring-lime-500/30", swatch: "bg-lime-500" },
  orange: { chip: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:ring-orange-500/30", swatch: "bg-orange-500" },
  pink: { chip: "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-500/15 dark:text-pink-400 dark:ring-pink-500/30", swatch: "bg-pink-500" },
  rose: { chip: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/30", swatch: "bg-rose-500" },
  sky: { chip: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:ring-sky-500/30", swatch: "bg-sky-500" },
  teal: { chip: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-400 dark:ring-teal-500/30", swatch: "bg-teal-500" },
  violet: { chip: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-400 dark:ring-violet-500/30", swatch: "bg-violet-500" },
}

/**
 * 色付きのタグ。isMuted は選んでいないタグ（ソースのタグの選択）を薄く出す
 */
export function TagChip({ color, isMuted = false, name }: { color: TagColor, isMuted?: boolean, name: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-theme-xs font-medium ring-1 ring-inset transition-opacity ${TAG_COLOR_CLASSES[color].chip} ${isMuted ? "opacity-40" : ""}`}
    >
      {name}
    </span>
  )
}
```

`TagChip` は state を持たないので `"use client"` を付けない（Server Component からも Client Component からも使える）。

### タグの画面（`/tags`）

```tsx
/** apps/admin/src/app/(dashboard)/tags/page.tsx */
import type { Metadata } from "next"
import { connection } from "next/server"

import { tagColorSchema } from "@repo/api-schema"

import { TagTable } from "@/components/features/tag/TagTable"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { tagApi } from "@/features/tag/tag.api"

export const metadata: Metadata = {
  title: "タグ | tech-english admin",
}

/**
 * タグの一覧。追加・編集・削除はモーダルで行う
 */
export default async function TagsPage() {
  /**
   * リクエストごとに API から取る（build 時に静的生成させない）
   */
  await connection()
  const { tags } = await tagApi.getList()

  return (
    <>
      <PageBreadcrumb pageTitle="タグ" />
      <ComponentCard desc="ソースに付ける技術タグ。ソースの登録・編集では、ここで登録したタグから選びます。" title="タグ一覧">
        {/**
          * パレットの選択肢は Server Component から渡す（Client Component で Zod のスキーマを import すると bundle に入るため）
          */}
        <TagTable colors={tagColorSchema.options} tags={tags} />
      </ComponentCard>
    </>
  )
}
```

`TagTable`（Client Component）：

- 列：タグ（`TagChip`）・使っているソース（`source_count`。0 なら「―」）・操作（「編集」「削除」）。並びは API の順（名前の順）
- 上に「タグを追加」（`primaryButtonClass`）
- 開いているモーダルを 1 つの state で持つ。列の「編集」「削除」がモーダルを開くので、列の定義はコンポーネントの中で作る（`SourceTable` の `COLUMNS` のような定数にできない）
- 0 件のときの `emptyMessage` は「まだタグがありません」「タグを追加すると、ソースの登録・編集で選べるようになります。」

```tsx
/** apps/admin/src/components/features/tag/TagTable.tsx */
"use client"

import { useState } from "react"

import type { GetTagListResponse } from "@repo/api-schema"

import { TagChip, type TagColor } from "@/components/features/tag/TagChip"
import { TagDeleteModal } from "@/components/features/tag/TagDeleteModal"
import { TagFormModal } from "@/components/features/tag/TagFormModal"
import { type Column, DataTable } from "@/components/ui/table"
import { primaryButtonClass } from "@/libs/ui-classes"

type TagListItem = GetTagListResponse["tags"][number]

/**
 * 開いているモーダル。null は閉じている
 */
type OpenModal = { kind: "create" } | { kind: "delete", tag: TagListItem } | { kind: "edit", tag: TagListItem } | null

const buildColumns = (openModal: (modal: OpenModal) => void): Column<TagListItem>[] => [
  { header: "タグ", render: (row) => <TagChip color={row.color} name={row.name} /> },
  {
    className: "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400",
    header: "使っているソース",
    render: (row) => (row.source_count > 0 ? `${row.source_count} 件` : <span className="text-gray-300 dark:text-gray-600">―</span>),
  },
  {
    className: "px-5 py-4 text-right text-theme-sm whitespace-nowrap",
    header: "",
    render: (row) => (
      <div className="flex justify-end gap-4">
        <button className="font-medium text-brand-500 hover:text-brand-600" onClick={() => openModal({ kind: "edit", tag: row })} type="button">編集</button>
        <button className="font-medium text-error-600 hover:text-error-700 dark:text-error-500" onClick={() => openModal({ kind: "delete", tag: row })} type="button">削除</button>
      </div>
    ),
  },
]

/**
 * タグの一覧の表。追加・編集・削除のモーダルの開閉もここで持つ
 */
export function TagTable({ colors, tags }: { colors: readonly TagColor[], tags: TagListItem[] }) {
  const [openModal, setOpenModal] = useState<OpenModal>(null)
  const closeModal = () => setOpenModal(null)

  return (
    <>
      <div className="flex justify-end">
        <button className={primaryButtonClass} onClick={() => setOpenModal({ kind: "create" })} type="button">タグを追加</button>
      </div>
      <DataTable
        columns={buildColumns(setOpenModal)}
        data={tags}
        emptyMessage={
          <div>
            <p className="text-base font-medium text-gray-800 dark:text-white/90">まだタグがありません</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">タグを追加すると、ソースの登録・編集で選べるようになります。</p>
          </div>
        }
        getRowKey={(row) => row.id}
      />
      {/**
        * key でタグごとに作り直す（別のタグの編集を開いたときに、前の入力・エラーを残さない）
        */}
      {(openModal?.kind === "create" || openModal?.kind === "edit") && (
        <TagFormModal key={openModal.kind === "edit" ? openModal.tag.id : "create"} colors={colors} onClose={closeModal} tag={openModal.kind === "edit" ? openModal.tag : null} />
      )}
      {openModal?.kind === "delete" && <TagDeleteModal key={openModal.tag.id} onClose={closeModal} tag={openModal.tag} />}
    </>
  )
}
```

### 追加・編集のモーダル（`TagFormModal`）

- 既存の `@/components/ui/modal` の `Modal`（`PassageAudioCard` の確認と同じ使い方）。開閉は親が持ち、`isOpen` は常に `true` で渡す（閉じるときは親がアンマウントする）
- 名前の入力（`inputClass`）と色の選択。色は「自動」とパレットの 10 色の見本（`TAG_COLOR_CLASSES[color].swatch` の丸）を `role="radiogroup"` で並べる
  - 追加：初期値は「自動」（api が今いちばん使われていない色を選ぶ）
  - 編集：今の色が選ばれた状態。「自動」は出さない（更新の API は色が必須）
- 色の見本の下に、今の名前と色で `TagChip` のプレビューを出す（「自動」のときはプレビューを出さず「保存すると色が決まります」）
- 保存は Server Action の結果（`TagActionResult`）を `useTransition` で受ける。成功したらモーダルを閉じる（`revalidatePath` で一覧は新しくなる）。失敗は名前の欄の下（`errors.name`）か、モーダルの上の error の囲み（`message`）に出す
  - `useActionState` にしないのは、成功したらモーダルを閉じるため（`PassageAudioCard` と同じく、結果を返す Server Action を `useTransition` から呼ぶ）

```tsx
/** apps/admin/src/components/features/tag/TagFormModal.tsx */
"use client"

import { type FormEvent, useState, useTransition } from "react"

import type { GetTagListResponse } from "@repo/api-schema"

import { createTagAction, type TagActionResult, updateTagAction } from "@/app/(dashboard)/tags/actions"
import { TAG_COLOR_CLASSES, TagChip, type TagColor } from "@/components/features/tag/TagChip"
import { Modal } from "@/components/ui/modal"
import { hintClass, inputClass, labelClass, outlineButtonClass, primaryButtonClass } from "@/libs/ui-classes"

type TagListItem = GetTagListResponse["tags"][number]

/**
 * 選んでいる色。auto は「自動」（追加のときだけ）
 */
type ColorChoice = TagColor | "auto"

/**
 * タグの追加・編集のモーダル。tag が null なら追加
 */
export function TagFormModal({ colors, onClose, tag }: { colors: readonly TagColor[], onClose: () => void, tag: TagListItem | null }) {
  const [name, setName] = useState(tag?.name ?? "")
  const [color, setColor] = useState<ColorChoice>(tag?.color ?? "auto")
  const [failure, setFailure] = useState<Extract<TagActionResult, { ok: false }> | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = tag
        ? await updateTagAction(tag.id, { color: color === "auto" ? tag.color : color, name })
        : await createTagAction({ color: color === "auto" ? null : color, name })
      if (result.ok) {
        onClose()
        return
      }
      setFailure(result)
    })
  }

  return (
    <Modal className="m-4 max-w-[520px] p-6 lg:p-8" isOpen onClose={onClose}>
      <form noValidate onSubmit={handleSubmit}>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">{tag ? "タグを編集" : "タグを追加"}</h4>
        {/** failure.message があれば error の囲み（SourceForm の state.message と同じ見た目） */}
        {/** 名前：<input className={inputClass} id="tag-name" maxLength={30} onChange={...} value={name} />。下に hint「大文字・小文字だけが違う名前は同じタグとみなします。カンマは使えません。」と failure.errors?.name?.[0] */}
        {/** 色：colors（と追加のときは "auto"）の見本を role="radio" の button で並べ、aria-checked で選択中を示す */}
        {/** プレビュー：color が auto でなく name が空でなければ <TagChip color={color} name={name.trim()} /> */}
        <div className="mt-6 flex justify-end gap-3">
          <button className={outlineButtonClass} onClick={onClose} type="button">キャンセル</button>
          <button className={primaryButtonClass} disabled={isPending} type="submit">{isPending ? "保存中…" : tag ? "保存する" : "追加する"}</button>
        </div>
      </form>
    </Modal>
  )
}
```

### 削除の確認のモーダル（`TagDeleteModal`）

- 本文：`source_count > 0` なら「`{source_count}` 件のソースで使われています。削除するとソースから外れます。」、0 なら「このタグはどのソースにも使われていません。」。どちらも削除するタグを `TagChip` で出す
- 「削除する」（`dangerOutlineButtonClass`）で `deleteTagAction(tag.id)` を `useTransition` から呼ぶ。成功したら閉じる。失敗（404 など）はモーダルの中に出す

### Server Action

```ts
/** apps/admin/src/app/(dashboard)/tags/actions.ts */
"use server"

import "server-only"

import { revalidatePath } from "next/cache"

import { createTagRequestSchema, deleteTagPathParamSchema, updateTagPathParamSchema, updateTagRequestSchema } from "@repo/api-schema"

import { tagApi } from "@/features/tag/tag.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * モーダルに返す結果。errors はリクエストのフィールド名ごと
 */
export type TagActionResult =
  | { ok: true }
  | { errors?: Record<string, string[] | undefined>, message?: string, ok: false }

const DUPLICATE_MESSAGE = "同じ名前のタグがあります（大文字・小文字は区別しません）。"

const NOT_FOUND_MESSAGE = "このタグは見つかりませんでした。画面を再読み込みしてください。"

const NAME_ERROR = "名前は 1〜30 文字で、カンマを含めずに入力してください。"

/**
 * API の失敗をモーダルの文言にする。409 は重複、404 は削除済み、それ以外は再試行を促す
 */
const convertApiErrorToResult = (error: unknown, fallbackMessage: string): TagActionResult => {
  if (error instanceof ApiClientError && error.status === 409) return { errors: { name: [DUPLICATE_MESSAGE] }, ok: false }
  if (error instanceof ApiClientError && error.status === 404) return { message: NOT_FOUND_MESSAGE, ok: false }
  console.error("Tag request failed", error)
  return { message: fallbackMessage, ok: false }
}

/**
 * タグの名前・色はソースの一覧・登録・編集にも出るので、ソースの画面もまとめて作り直す
 */
const revalidateTagPaths = () => {
  revalidatePath("/tags")
  revalidatePath("/content-sources", "layout")
}

/**
 * タグの作成。color が null（「自動」）なら送らず、api に割り当てさせる
 */
export const createTagAction = async (input: { color: string | null, name: string }): Promise<TagActionResult> => {
  const parsed = createTagRequestSchema.safeParse(input.color === null ? { name: input.name } : input)
  if (!parsed.success) return { errors: { name: [NAME_ERROR] }, ok: false }

  try {
    await tagApi.create(parsed.data)
  } catch (error) {
    return convertApiErrorToResult(error, "追加に失敗しました。時間をおいて再度お試しください。")
  }
  revalidateTagPaths()
  return { ok: true }
}

/**
 * タグの名前と色の変更。Server Action の引数はブラウザから届くので、id も検証する
 */
export const updateTagAction = async (id: number, input: { color: string, name: string }): Promise<TagActionResult> => {
  const params = updateTagPathParamSchema.safeParse({ id })
  if (!params.success) return { message: NOT_FOUND_MESSAGE, ok: false }
  const parsed = updateTagRequestSchema.safeParse(input)
  if (!parsed.success) return { errors: { name: [NAME_ERROR] }, ok: false }

  try {
    await tagApi.update(params.data.id, parsed.data)
  } catch (error) {
    return convertApiErrorToResult(error, "保存に失敗しました。時間をおいて再度お試しください。")
  }
  revalidateTagPaths()
  return { ok: true }
}

/**
 * タグの削除。紐付いたソースからも外れる（api の ON DELETE CASCADE）
 */
export const deleteTagAction = async (id: number): Promise<TagActionResult> => {
  /** deleteTagPathParamSchema で id を検証 → tagApi.delete → 失敗は convertApiErrorToResult(error, "削除に失敗しました。…")。成功で revalidateTagPaths() */
}
```

- 色の検証の失敗（パレットに無い色）は画面から起きない（選択肢しか送らない）ので、名前の文言にまとめる
- `revalidatePath("/content-sources", "layout")` は `/content-sources/new`・`/content-sources/[id]` も含めて作り直す（タグの名前・色を変えた直後にソースの画面を開いても古い表示にしない）

### サイドバー

`src/components/layout/AppSidebar.tsx` の `navItems` の「ソース」の後に「タグ」を足す。アイコンは `@/icons` の `ListIcon`（タグのアイコンは無い）。

```tsx
const navItems: NavItem[] = [
  { icon: <DocsIcon />, name: "問題", path: "/passages" },
  { icon: <FolderIcon />, name: "ソース", path: "/content-sources" },
  { icon: <ListIcon />, name: "タグ", path: "/tags" },
]
```

- [admin-dashboard](../../admin-dashboard/README.md) の「ダッシュボード」（先頭）と [admin-users](../../admin-users/README.md) の「ユーザー」（末尾）も `navItems` に足される。先にどちらが入っていても、並びは「ダッシュボード」「問題」「ソース」「タグ」「ユーザー」にする（「タグ」は「ソース」の直後）
- 選択中の判定（`findActiveMenuPath`）は前方一致なので、`/tags` のほかに足すものは無い

### `apps/admin/CLAUDE.md`

「接続済みの画面」の表に足す。

| パス | 画面 | 実装 |
| --- | --- | --- |
| `/tags` | タグ | `app/(dashboard)/tags/page.tsx` + `components/features/tag/TagTable.tsx`（追加・編集は `TagFormModal`、削除の確認は `TagDeleteModal`）+ `app/(dashboard)/tags/actions.ts`（Server Action）。色付きのタグは `TagChip`（色 → クラスの対応表はここだけに置く） |

## 動作確認

```bash
pnpm --filter @repo/api-schema build
cd apps/admin && pnpm build
pnpm lint:fix
```

api（step2 まで入ったもの）と admin を起動し、`verify-web-page` skill の手順で Playwright MCP を使って確かめる（port 3030。Basic 認証は `apps/admin/CLAUDE.md` の「アクセス制御」）。

- [ ] サイドバーに「タグ」が「ソース」の直後に出て、`/tags` で選択中になる
- [ ] `/tags` に移行したタグ（step1）が名前の順に色付きで並び、使っているソースの数が出る。0 件のときは「まだタグがありません」
- [ ] 「タグを追加」で名前だけ入れて追加すると、いちばん使われていない色が付く（パレットの先頭に近い方）
- [ ] 色を選んで追加すると、その色になる。プレビューが選んだ色で出る
- [ ] `React` があるときに `react` を追加・別のタグを `REACT` に変えると、名前の欄の下に「同じ名前のタグがあります（大文字・小文字は区別しません）。」が出て、モーダルは閉じない
- [ ] 空・31 文字・カンマを含む名前は名前の欄の下にエラーが出る
- [ ] 編集で名前と色を変えると一覧に反映され、`/content-sources` のそのタグの表示も変わる（step5 の後）
- [ ] 使われているタグの削除の確認に「N 件のソースで使われています。削除するとソースから外れます。」が出て、削除すると一覧から消える。使われていないタグは「このタグはどのソースにも使われていません。」
- [ ] 別のタブで消したタグを編集・削除すると「このタグは見つかりませんでした。…」が出る
- [ ] Esc・背景のクリック・「キャンセル」でモーダルが閉じる。別のタグの編集を開き直すと、前の入力・エラーが残っていない
- [ ] ライトとダークの両方でタグの文字が読める（10 色すべて。step1 の移行の後に 10 個以上のタグを作って確かめる）
- [ ] `browser_console_messages` の error が 0 件
- [ ] スクリーンショット：サイドバーの before（`/content-sources` を開いた状態）を `docs/screenshots/source-tags/before-sidebar.png`、タグの画面と追加のモーダルの after を `docs/screenshots/source-tags/after-tags.png`・`after-tag-form.png` に撮って PR に載せる（タグの画面は新しい画面なので before は無し）
