import Link from "next/link"

import type { GetMemoListResponse } from "@repo/api-schema"

/** memo1件 */
type Props = {
  memo: GetMemoListResponse["memos"][number]
}

/**
 * メモ１件分の見た目
 */
export function MemoListItem({ memo }: Props) {
  return (
    <li className="rounded-lg border border-zinc-200 p-4 transition hover:border-zinc-400">
      <Link href={`/memos/${memo.id}`} className="block">
        <h2 className="font-medium">{memo.title}</h2>
        <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{memo.body}</p>
      </Link>
    </li>
  )
}