"use client"

import { useEffect } from "react"

import type { GetMemoListResponse } from "@repo/api-schema"

import { MemoList } from "@/components/features/memo/MemoList"
import { MemoSearch } from "@/components/features/memo/MemoSearch"
import { useMemoStore } from "@/features/memo/memo.store"

type Props = {
  initialMemos: GetMemoListResponse["memos"]
}

/**
 * 検索ボックスと一覧をまとめるコンテナ。
 * サーバーで取得した初期一覧を store に seed し、
 * 以降は MemoSearch が書き込む検索結果（store.results）を一覧へ反映する。
 */
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
