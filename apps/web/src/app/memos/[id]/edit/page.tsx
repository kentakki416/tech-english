import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getMemoPathParamSchema } from "@repo/api-schema"

import { updateMemoAction } from "@/app/memos/actions"
import { MemoForm } from "@/components/features/memo/MemoForm"
import { memoApi } from "@/features/memo/memo.api"
import { ApiClientError } from "@/libs/api-client"

type Props = { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "メモを編集" }

/**
 * メモ編集ページ
 */
export default async function EditMemoPage({ params }: Props) {
  const parsed = getMemoPathParamSchema.safeParse(await params)
  if (!parsed.success) notFound()

  let memo
  try {
    memo = await memoApi.getDetail(parsed.data.id)
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound()
    throw error
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">メモを編集</h1>
      <div className="mt-6">
        <MemoForm
          action={updateMemoAction.bind(null, memo.id)}
          defaultValues={{ body: memo.body, title: memo.title }}
          submitLabel="更新する"
        />
      </div>
    </main>
  )
}