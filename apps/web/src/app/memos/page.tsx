import type { Metadata } from "next"
import Link from "next/link"

import { SearchableMemoList } from "@/components/features/memo/SearchableMemoList"
import { memoApi } from "@/features/memo/memo.api"

export const metadata: Metadata = {
  title: "メモ一覧"
}

/**
 * メモ一覧ページ
 */
export default async function MemosPage() {
  const { memos } = await memoApi.getList()

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">メモ一覧</h1>
        <Link href="/memos/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">新規作成</Link>
      </div>
      <div className="mt-6">
        <SearchableMemoList initialMemos={memos} />
      </div>
    </main>
  )
}