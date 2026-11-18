"use client"

import { useEffect } from "react"

import type { GetMemoListResponse } from "@repo/api-schema"

import { useMemoStore } from "@/features/memo/memo.store"

export function MemoSearch() {
  const query = useMemoStore((s) => s.query)
  const isLoading = useMemoStore((s) => s.isLoading)
  const setStoreQuery = useMemoStore((s) => s.setStoreQuery)
  const setStoreResults = useMemoStore((s) => s.setStoreResults)
  const setStoreIsLoading = useMemoStore((s) => s.setStoreIsLoading)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setStoreIsLoading(true)
      try {
        const res = await fetch(`/api/memos?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        })
        const data = (await res.json()) as { memos: GetMemoListResponse["memos"] }
        setStoreResults(data.memos)
      } catch (err) {
        /**
         * 入力が変わって前のリクエストを中断したときの AbortError は、失敗として扱わない
         */
        if (err instanceof Error && err.name === "AbortError") return
        console.error("メモ検索に失敗しました", err)
      } finally {
        setStoreIsLoading(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, setStoreResults, setStoreIsLoading])

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setStoreQuery(e.target.value)}
        placeholder="メモ検索..."
        className="w-full rounded border border-zinc-300 p-2"
      />
      {isLoading && <p className="mt-1 text-sm text-zinc-400">検索中...</p>}
    </div>
  )
}
