"use client"

import Link from "next/link"
import { useState, useTransition } from "react"

import type { GetAdminUserAttemptsResponse } from "@repo/api-schema"

import { type LoadMoreUserAttemptsFailureReason, loadMoreUserAttemptsAction } from "@/app/(dashboard)/users/[id]/actions"
import Badge from "@/components/ui/badge/Badge"
import { formatDateTime } from "@/libs/date"
import { formatMinutesSeconds } from "@/libs/format-stats"
import { outlineButtonClass } from "@/libs/ui-classes"

type Attempt = GetAdminUserAttemptsResponse["attempts"][number]

/**
 * 続きを読めなかったときの文言。押し直しても直らないとき（ユーザーが居ない）は開き直しを促す
 */
const LOAD_FAILURE_MESSAGES: Record<LoadMoreUserAttemptsFailureReason, string> = {
  not_found: "ユーザーが見つかりませんでした。一覧から開き直してください。",
  unavailable: "続きを読み込めませんでした。もう一度押してください。",
}

/**
 * 学習履歴（新しい順）。「さらに読み込む」で次のページを Server Action で読む（cursor）。
 * 提出日時は提出した瞬間（submitted_at）をユーザーの今のタイムゾーンで出す
 */
export function UserAttemptList({ initialPage, timeZone, userId }: { initialPage: GetAdminUserAttemptsResponse, timeZone: string, userId: number }) {
  const [attempts, setAttempts] = useState<Attempt[]>(initialPage.attempts)
  const [nextCursor, setNextCursor] = useState<number | null>(initialPage.next_cursor)
  const [failureReason, setFailureReason] = useState<LoadMoreUserAttemptsFailureReason | null>(null)
  const [isPending, startTransition] = useTransition()

  const loadMore = () => {
    if (nextCursor === null) return
    startTransition(async () => {
      /**
       * action が返す失敗のほか、通信の失敗（例外）も押し直せる失敗として出す（例外を error boundary に送ると、読み込んだ行ごと画面が消えるため）
       */
      const result = await loadMoreUserAttemptsAction(userId, nextCursor).catch(() => ({ ok: false as const, reason: "unavailable" as const }))
      if (!result.ok) {
        setFailureReason(result.reason)
        return
      }
      setFailureReason(null)
      setAttempts(previous => [...previous, ...result.page.attempts])
      setNextCursor(result.page.next_cursor)
    })
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">学習履歴</h3>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">解いた問題を新しい順に。日時はユーザーのタイムゾーン</p>
      </div>
      {attempts.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500 sm:px-6 dark:text-gray-400">まだ問題を解いていません</p>
      ) : (
        <div className="custom-scrollbar mt-4 overflow-x-auto">
          <table className="min-w-full">
            <thead className="border-y border-gray-100 dark:border-white/5">
              <tr className="text-theme-xs text-gray-500 dark:text-gray-400">
                <th className="px-5 py-3 text-start font-medium whitespace-nowrap sm:px-6">提出日時</th>
                <th className="px-5 py-3 text-start font-medium">問題</th>
                <th className="px-5 py-3 text-start font-medium whitespace-nowrap">点数</th>
                <th className="px-5 py-3 text-start font-medium whitespace-nowrap">時間</th>
                <th className="px-5 py-3 text-start font-medium whitespace-nowrap">アシスト</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-theme-sm text-gray-500 dark:divide-white/5 dark:text-gray-400">
              {attempts.map(attempt => (
                <tr key={attempt.id}>
                  <td className="px-5 py-3 whitespace-nowrap tabular-nums sm:px-6">{formatDateTime(attempt.submitted_at, timeZone)}</td>
                  <td className="min-w-56 px-5 py-3">
                    <Link className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90" href={`/passages/${attempt.passage_id}`}>{attempt.title}</Link>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap tabular-nums">
                    {attempt.correct_count} / {attempt.question_count}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap tabular-nums">
                    {formatMinutesSeconds(attempt.elapsed_seconds)}
                    {attempt.is_overtime && <span className="ml-2"><Badge color="warning" size="sm">超過</Badge></span>}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{attempt.used_assist ? "使った" : "なし"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col items-center gap-2 px-5 py-4 sm:px-6">
        {failureReason !== null && <p className="text-theme-xs text-error-600 dark:text-error-500">{LOAD_FAILURE_MESSAGES[failureReason]}</p>}
        {nextCursor !== null && (
          <button className={`${outlineButtonClass} disabled:cursor-not-allowed disabled:opacity-50`} disabled={isPending} type="button" onClick={loadMore}>
            {isPending ? "読み込み中…" : "さらに読み込む"}
          </button>
        )}
      </div>
    </section>
  )
}
