"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import type { GetUserAttemptsResponse, LearningRecordAttemptResponse } from "@repo/api-schema"

import { ScoreSquares } from "@/components/ui/ScoreSquares"
import { formatDateHeading, formatSeconds } from "@/libs/format"

/**
 * 学習した日（study_date）ごとにまとめる。並びは受け取った順（提出日時の新しい順）のまま
 */
const groupAttemptsByStudyDate = (attempts: LearningRecordAttemptResponse[]): { attempts: LearningRecordAttemptResponse[], date: string }[] => {
  const groups = new Map<string, LearningRecordAttemptResponse[]>()
  for (const attempt of attempts) {
    const group = groups.get(attempt.study_date)
    if (group) group.push(attempt)
    else groups.set(attempt.study_date, [attempt])
  }
  return Array.from(groups, ([date, items]) => ({ attempts: items, date }))
}

/**
 * 学習履歴の一覧。1 ページ目は Server Component から受け取り、続きは「さらに表示」で
 * Route Handler（`/api/user/attempts`）から取得して後ろに足す
 */
export function HistoryList({
  initialAttempts,
  initialNextCursor,
}: {
  initialAttempts: LearningRecordAttemptResponse[]
  initialNextCursor: number | null
}) {
  const [attempts, setAttempts] = useState(initialAttempts)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const groups = useMemo(() => groupAttemptsByStudyDate(attempts), [attempts])

  const loadMore = async () => {
    if (nextCursor === null) return
    setIsLoadingMore(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/user/attempts?${new URLSearchParams({ cursor: String(nextCursor) })}`)
      if (!res.ok) throw new Error(`status ${res.status}`)
      const page = await res.json() as GetUserAttemptsResponse
      setAttempts(current => [...current, ...page.attempts])
      setNextCursor(page.next_cursor)
    } catch {
      setLoadError("読み込めませんでした。時間をおいて再度お試しください。")
    } finally {
      setIsLoadingMore(false)
    }
  }

  if (attempts.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
        <p className="text-base font-medium text-fg">まだ提出した挑戦はありません。</p>
        <Link
          className="mt-5 inline-grid h-10 place-items-center rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          href="/passages"
        >
          問題一覧
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="mt-8 space-y-8">
        {groups.map(group => (
          <section key={group.date}>
            <h2 className="text-sm text-fg-muted">{formatDateHeading(group.date)}</h2>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {group.attempts.map(attempt => (
                <li key={attempt.id}>
                  <Link
                    className="group grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-1 py-3.5 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-amber/60 sm:grid-cols-[3rem_minmax(0,1fr)_auto_4.5rem_4.5rem]"
                    href={`/attempts/${attempt.id}/result`}
                  >
                    <span className="text-xs text-fg-faint tabular-nums">{attempt.submitted_time}</span>
                    <span className="truncate font-reading text-[16px] text-fg group-hover:text-amber-bright">{attempt.title}</span>
                    <span className="flex items-center gap-2 text-sm text-fg tabular-nums">
                      <ScoreSquares
                        results={Array.from({ length: attempt.question_count }, (_, index) => index < attempt.correct_count)}
                        size="sm"
                      />
                      {attempt.correct_count}/{attempt.question_count}
                    </span>
                    <span className={`col-start-2 text-xs tabular-nums sm:col-start-auto sm:text-right sm:text-sm ${attempt.is_overtime ? "text-wrong" : "text-fg-muted"}`}>
                      {formatSeconds(attempt.elapsed_seconds)}
                      {attempt.is_overtime && <span className="ml-1 text-[11px]">超過</span>}
                    </span>
                    <span className="text-xs text-fg-faint sm:text-right">{attempt.used_assist ? "アシストあり" : "アシストなし"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
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
