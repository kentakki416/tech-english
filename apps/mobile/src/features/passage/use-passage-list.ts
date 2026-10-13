import { useCallback, useEffect, useRef, useState } from "react"

import type { PassageListItemResponse } from "@repo/api-schema"

import type { PassageFilterQuery } from "./passage-query"
import { passageApi } from "./passage.api"

/**
 * 1 ページ目の取り方。initial は絞り込みが変わったとき（一覧の代わりに読み込み中を出す）、
 * refresh は引っ張って更新、silent は画面に戻ったときの取り直し（読み込み中を出さない）
 */
type FirstPageMode = "initial" | "refresh" | "silent"

export type PassageListState = {
  /**
   * 1 ページ目を取れなかった（一覧が空のときだけ画面に出す）
   */
  hasError: boolean
  isLoading: boolean
  isLoadingMore: boolean
  isRefreshing: boolean
  items: PassageListItemResponse[]
  loadMore: () => void
  /**
   * 1 ページ目から取り直す。isSilent なら引っ張って更新の表示（isRefreshing）を出さない
   */
  refresh: (options?: { isSilent?: boolean }) => void
  /**
   * 公開中の問題があるソースのタグ全件（絞り込みのチップ）
   */
  tags: string[]
  /**
   * 絞り込み後の件数
   */
  totalCount: number
}

/**
 * 問題一覧の取得（cursor ページング）。絞り込みが変わったら 1 ページ目から取り直す。
 * 呼び出し側は絞り込みが変わったときだけ filter の参照を変える（同じ条件で参照が変わると取り直してしまう）
 */
export function usePassageList(filter: PassageFilterQuery): PassageListState {
  const [items, setItems] = useState<PassageListItemResponse[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  /**
   * 1 ページ目を取りに行くたびに進める連番。前の絞り込みのレスポンスが後から届いたら（連番が古ければ）捨てる
   */
  const requestSeqRef = useRef(0)
  /**
   * 次のページを取りに行っている間は重ねない（onEndReached は描画の前に続けて呼ばれることがある）
   */
  const isLoadingMoreRef = useRef(false)
  /**
   * 最新の絞り込み。refresh の参照を変えずに今の条件で取り直すため
   */
  const filterRef = useRef(filter)

  const fetchFirstPage = useCallback(async (mode: FirstPageMode) => {
    const seq = ++requestSeqRef.current
    isLoadingMoreRef.current = false
    setIsLoadingMore(false)
    if (mode === "initial") setIsLoading(true)
    if (mode === "refresh") setIsRefreshing(true)
    try {
      const page = await passageApi.getList(filterRef.current)
      if (seq !== requestSeqRef.current) return
      setItems(page.passages)
      setNextCursor(page.next_cursor)
      setTags(page.tags)
      setTotalCount(page.total_count)
      setHasError(false)
    } catch (error) {
      if (seq !== requestSeqRef.current) return
      console.warn("Failed to fetch passages:", error)
      setHasError(true)
      /**
       * 絞り込みを変えたときは前の条件の一覧を残さない。取り直しの失敗は今の一覧を残す
       */
      if (mode === "initial") {
        setItems([])
        setNextCursor(null)
        setTotalCount(0)
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    filterRef.current = filter
    void fetchFirstPage("initial")
  }, [fetchFirstPage, filter])

  const refresh = useCallback((options?: { isSilent?: boolean }) => {
    void fetchFirstPage(options?.isSilent ? "silent" : "refresh")
  }, [fetchFirstPage])

  const loadMore = useCallback(() => {
    if (nextCursor === null || isLoading || isRefreshing || isLoadingMoreRef.current) return
    const seq = requestSeqRef.current
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)

    const fetchNextPage = async () => {
      try {
        const page = await passageApi.getList({ ...filterRef.current, cursor: nextCursor })
        if (seq !== requestSeqRef.current) return
        /**
         * ページの間に公開された問題で行が重なっても、同じ問題を 2 回出さない
         */
        setItems(current => {
          const ids = new Set(current.map(passage => passage.id))
          return [...current, ...page.passages.filter(passage => !ids.has(passage.id))]
        })
        setNextCursor(page.next_cursor)
        setTotalCount(page.total_count)
      } catch (error) {
        /**
         * 失敗しても一覧はそのまま。もう一度下端までスクロールすると onEndReached から再び取りに行く
         */
        if (seq === requestSeqRef.current) console.warn("Failed to fetch more passages:", error)
      } finally {
        if (seq === requestSeqRef.current) {
          isLoadingMoreRef.current = false
          setIsLoadingMore(false)
        }
      }
    }
    void fetchNextPage()
  }, [isLoading, isRefreshing, nextCursor])

  return { hasError, isLoading, isLoadingMore, isRefreshing, items, loadMore, refresh, tags, totalCount }
}
