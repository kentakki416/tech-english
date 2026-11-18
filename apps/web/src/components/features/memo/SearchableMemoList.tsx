"use client"

import { useEffect } from "react"

import type { GetMemoListResponse } from "@repo/api-schema"

import { MemoList } from "@/components/features/memo/MemoList"
import { MemoSearch } from "@/components/features/memo/MemoSearch"
import { useMemoStore } from "@/features/memo/memo.store"

type Props = {
  initialMemos: GetMemoListResponse["memos"]
}

export function SearchableMemoList({ initialMemos }: Props) {
  const results = useMemoStore((s) => s.results)
  const setStoreResults = useMemoStore((s) => s.setStoreResults)

  /**
   * 初回表示ではサーバー取得済みの一覧をそのまま出す（空クエリ時のちらつき防止）
   */
  useEffect(() => {
    setStoreResults(initialMemos)
  }, [initialMemos, setStoreResults])

  return (
    <div className="space-y-4">
      <MemoSearch />
      <MemoList memos={results} />
    </div>
  )
}
