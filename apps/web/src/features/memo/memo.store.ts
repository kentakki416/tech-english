import { create } from "zustand"

import type { GetMemoListResponse } from "@repo/api-schema"

type Memo = GetMemoListResponse["memos"][number]

type MemoSearchState = {
  isLoading: boolean
  query: string
  results: Memo[]
  setStoreIsLoading: (isLoading: boolean) => void
  setStoreQuery: (query: string) => void
  setStoreResults: (results: Memo[]) => void
}

/**
 * メモ検索のクライアント状態だけをもつストア
 */
export const useMemoStore = create<MemoSearchState>((set) => ({
  isLoading: false,
  query: "",
  results: [],
  setStoreIsLoading: (isLoading) => set({ isLoading }),
  setStoreQuery: (query) => set({ query }),
  setStoreResults: (results) => set({ results })
}))