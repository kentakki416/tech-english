"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import type { GetPassageListResponse, PassageListItemResponse } from "@repo/api-schema"

import { ScoreSquares } from "@/components/ui/ScoreSquares"
import { buildPassageSearchParams, isPassageFilterActive, type PassageFilterQuery } from "@/features/passage/passage-query"
import { formatSeconds } from "@/libs/format"

import { DifficultyMeter } from "./DifficultyMeter"
import { SourceMeta } from "./SourceMeta"

/**
 * 行の右端の挑戦状況（挑戦中 / 未挑戦 / 最高正答数）
 */
function MyStatus({ passage }: { passage: PassageListItemResponse }) {
  const { attempt_count: attemptCount, best_correct_count: bestCorrectCount, in_progress_attempt_id: inProgressAttemptId } = passage.my_status
  if (inProgressAttemptId !== null) {
    return <span className="rounded border border-amber/50 px-1.5 py-px text-xs text-amber">挑戦中</span>
  }
  if (attemptCount === 0) {
    return <span className="text-xs text-fg-faint">未挑戦</span>
  }
  const bestCorrect = bestCorrectCount ?? 0
  return (
    <>
      <ScoreSquares
        results={Array.from({ length: passage.question_count }, (_, index) => index < bestCorrect)}
        size="sm"
      />
      <span className="text-xs text-fg">{bestCorrect}/{passage.question_count}</span>
    </>
  )
}

/**
 * 問題一覧。1 ページ目は Server Component から受け取り、2 ページ目以降は「さらに表示」で
 * Route Handler（`/api/passages`）から取得して後ろに足す。絞り込みが変わったら親が key を変えて状態を捨てる
 */
export function PassageList({ initialPage, query }: { initialPage: GetPassageListResponse, query: PassageFilterQuery }) {
  const router = useRouter()
  const [passages, setPassages] = useState(initialPage.passages)
  const [nextCursor, setNextCursor] = useState(initialPage.next_cursor)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isClearing, startClearing] = useTransition()

  const loadMore = async () => {
    if (nextCursor === null) return
    setIsLoadingMore(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/passages?${buildPassageSearchParams({ ...query, cursor: nextCursor })}`)
      if (!res.ok) throw new Error(`status ${res.status}`)
      const page = await res.json() as GetPassageListResponse
      setPassages(current => [...current, ...page.passages])
      setNextCursor(page.next_cursor)
    } catch {
      setLoadError("読み込めませんでした。時間をおいて再度お試しください。")
    } finally {
      setIsLoadingMore(false)
    }
  }

  if (passages.length === 0) {
    /**
     * 絞り込みが無いのに空なら、公開中の問題がまだ無い（絞り込みを解除しても変わらないので、解除のボタンは出さない）
     */
    const isFiltered = isPassageFilterActive(query)
    return (
      <div className={`mt-6 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center transition-opacity ${isClearing ? "opacity-60" : ""}`}>
        <p className="text-base font-medium text-fg">{isFiltered ? "条件に合う問題がありません" : "公開中の問題はまだありません"}</p>
        <p className="mt-2 text-sm text-fg-muted">
          {isFiltered ? "絞り込みの条件を減らすと、ほかの問題が表示されます。" : "問題が公開されると、ここに表示されます。"}
        </p>
        {isFiltered && (
          <button
            className="mt-5 h-9 rounded-lg border border-line-strong px-4 text-sm text-fg outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-amber/60"
            onClick={() => startClearing(() => router.replace("/passages", { scroll: false }))}
            type="button"
          >
            絞り込みを解除する
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <ul className="mt-2 divide-y divide-line">
        {passages.map(passage => (
          <li key={passage.id}>
            <Link
              className="group -mx-3 grid gap-x-6 gap-y-2 rounded-lg px-3 py-4 outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-amber/60 md:grid-cols-[minmax(0,1fr)_auto]"
              href={`/passages/${passage.id}`}
            >
              <div className="min-w-0">
                <p className="truncate font-reading text-[19px] leading-snug text-fg group-hover:text-amber-bright">{passage.title}</p>
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <SourceMeta kind={passage.source.kind} name={passage.source.name} />
                  <span className="flex gap-1.5">
                    {passage.source.tags.map(tag => <span key={tag} className="text-xs text-fg-faint">#{tag}</span>)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-5 text-sm text-fg-muted tabular-nums md:justify-end">
                <DifficultyMeter level={passage.difficulty} />
                <span className="w-14 text-right">{passage.word_count} 語</span>
                <span className="w-12 text-right">{formatSeconds(passage.time_limit_seconds)}</span>
                <span className="flex w-24 items-center justify-end gap-2">
                  <MyStatus passage={passage} />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {nextCursor !== null && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            className="h-9 rounded-lg border border-line-strong px-4 text-sm text-fg outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-amber/60 disabled:opacity-60"
            disabled={isLoadingMore}
            onClick={loadMore}
            type="button"
          >
            {isLoadingMore ? "読み込み中…" : "さらに表示"}
          </button>
          {loadError && <p className="text-sm text-wrong" role="alert">{loadError}</p>}
        </div>
      )}
    </>
  )
}
