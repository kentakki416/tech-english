import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getMemoPathParamSchema } from "@repo/api-schema"

import { DeleteMemoButton } from "@/components/features/memo/DeletememoButton"
import { TrackEvent } from "@/components/ui/TrackEvent"
import { memoApi } from "@/features/memo/memo.api"
import { ApiClientError } from "@/libs/api-client"

import { deleteMemoAction } from "../actions"

type Props = {
  params: Promise<{ id: string }>
}

/** URLの:idを検証し、なければnotFound() */
async function loadMemo(params: Props["params"]) {
  const parsed = getMemoPathParamSchema.safeParse(await params)
  if (!parsed.success) notFound()

  try {
    return await memoApi.getDetail(parsed.data.id)
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound()
    throw error
  }
}

/** paramsのような動的なページのtitleを作る */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const parsed = getMemoPathParamSchema.safeParse(await params)
  if (!parsed.success) return { title: "メモが見つかりません" }
  const memo = await memoApi.getDetail(parsed.data.id).catch (() => null)
  return { title: memo ? memo.title : "メモが見つかりません" }
}

/**
 * メモ詳細ページ
 */
export default async function MemoDetailPage({ params }: Props) {
  const memo = await loadMemo(params)

  return (
    <main className="mx-auto max-w-2xl p-6">
      <TrackEvent name="memo_viewed" properties={{ memo_id: memo.id }} />
      <h1 className="text-2xl font-semibold">{memo.title}</h1>
      <p className="mt-2 whitespace-pre-wrap text-zinc-700">{memo.body}</p>
      <p className="mt-6 text-xs text-zinc-400">更新： {memo.updated_at}</p>

      <div className="mt-6 flex gap-3">
        <Link href={`/memos/${memo.id}/edit`}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm">編集</Link>
        <DeleteMemoButton action={deleteMemoAction.bind(null, memo.id)} />
      </div>
    </main>
  )
}