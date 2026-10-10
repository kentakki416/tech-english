import Link from "next/link"

export function MemoEmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center">
      <p className="text-zinc-500">まだメモがありません</p>
      <Link href="/memos/new" className="mt-3 inline-block text-blue-600 hover:underline">最初のメモを作成する</Link>
    </div>
  )
}