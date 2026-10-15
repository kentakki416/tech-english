"use client"

import Link from "next/link"
import { useState } from "react"

import type { MockUserAttempt } from "@/libs/mock-data"

import { formatElapsedWithLimit } from "../../_components/stats-format"
import { outlineButtonClass } from "../../_components/ui"

/**
 * 1 回に読む件数（本実装は API の limit）
 */
const PAGE_SIZE = 10

/**
 * 使ったアシストを「和訳 1・単語 3」のように並べる。使っていなければ「なし」
 */
const formatAssists = (assists: MockUserAttempt["assists"]): string => {
  const parts = [
    assists.translated > 0 ? `和訳 ${assists.translated}` : null,
    assists.lookedUp > 0 ? `単語 ${assists.lookedUp}` : null,
    assists.listened > 0 ? `読み上げ ${assists.listened}` : null,
  ].filter(part => part !== null)
  return parts.length > 0 ? parts.join("・") : "なし"
}

/**
 * 学習履歴（新しい順）。「さらに読み込む」で続きを出す（本実装は cursor で次を読む Server Action）
 */
export function UserAttemptList({ attempts }: { attempts: MockUserAttempt[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const visible = attempts.slice(0, visibleCount)

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
              <tr className="text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                <th className="px-5 py-3 text-start font-medium whitespace-nowrap sm:px-6">提出日時</th>
                <th className="px-5 py-3 text-start font-medium">問題</th>
                <th className="px-5 py-3 text-start font-medium whitespace-nowrap">点数</th>
                <th className="px-5 py-3 text-start font-medium whitespace-nowrap">時間 / 制限</th>
                <th className="px-5 py-3 text-start font-medium whitespace-nowrap">アシスト</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-theme-sm text-gray-500 dark:divide-white/5 dark:text-gray-400">
              {visible.map(attempt => (
                <tr key={attempt.id}>
                  <td className="px-5 py-3 whitespace-nowrap tabular-nums sm:px-6">{attempt.submittedAt}</td>
                  <td className="min-w-56 px-5 py-3">
                    <Link className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90" href="/mock/passages/42">{attempt.title}</Link>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap tabular-nums">
                    {attempt.correctCount} / {attempt.questionCount}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap tabular-nums">{formatElapsedWithLimit(attempt.elapsedSeconds, attempt.timeLimitSeconds)}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{formatAssists(attempt.assists)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-center px-5 py-4 sm:px-6">
        {visibleCount < attempts.length && (
          <button className={outlineButtonClass} onClick={() => setVisibleCount(count => count + PAGE_SIZE)} type="button">
            さらに読み込む
          </button>
        )}
      </div>
    </section>
  )
}
