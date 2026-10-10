import type { GetMemoListResponse } from "@repo/api-schema"

import { MemoEmptyState } from "./MemoEmptyState"
import { MemoListItem } from "./MemoListItem"

type Props = { memos : GetMemoListResponse["memos"] }

export function MemoList({ memos }: Props) {
  if (memos.length === 0) return <MemoEmptyState />

  return (
    <ul className="space-y-3">
      {memos.map((memo) => (
        <MemoListItem key={memo.id} memo={memo} />
      ))}
    </ul>
  )
}