import Link from "next/link"

import { formatSeconds, MOCK_ATTEMPT_HISTORY } from "@/libs/mock-data"

import { AppHeader } from "../_components/AppHeader"
import { ScoreSquares } from "../_components/parts"

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]

const formatDateHeading = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`)
  return `${value.getUTCFullYear()}年${value.getUTCMonth() + 1}月${value.getUTCDate()}日（${WEEKDAY_LABELS[value.getUTCDay()]}）`
}

/**
 * 学習履歴（モック）
 */
export default function MockHistoryPage() {
  const dates = Array.from(new Set(MOCK_ATTEMPT_HISTORY.map(attempt => attempt.date)))

  return (
    <>
      <AppHeader current="history" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-xl font-semibold text-fg">学習履歴</h1>
        <p className="mt-1 text-sm text-fg-muted">提出した挑戦を新しい順に表示しています。</p>

        <div className="mt-8 space-y-8">
          {dates.map(date => (
            <section key={date}>
              <h2 className="text-sm text-fg-muted">{formatDateHeading(date)}</h2>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {MOCK_ATTEMPT_HISTORY.filter(attempt => attempt.date === date).map(attempt => (
                  <li key={attempt.id}>
                    <Link
                      className="group grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-1 py-3.5 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-amber/60 sm:grid-cols-[3rem_minmax(0,1fr)_auto_4.5rem_4.5rem]"
                      href="/mock/attempts/42/result"
                    >
                      <span className="text-xs text-fg-faint tabular-nums">{attempt.submittedTime}</span>
                      <span className="truncate font-reading text-[16px] text-fg group-hover:text-amber-bright">{attempt.title}</span>
                      <span className="flex items-center gap-2 text-sm text-fg tabular-nums">
                        <ScoreSquares results={Array.from({ length: attempt.questionCount }, (_, index) => index < attempt.correctCount)} size="sm" />
                        {attempt.correctCount}/{attempt.questionCount}
                      </span>
                      <span className={`col-start-2 text-xs tabular-nums sm:col-start-auto sm:text-right sm:text-sm ${attempt.isOvertime ? "text-wrong" : "text-fg-muted"}`}>
                        {formatSeconds(attempt.elapsedSeconds)}
                        {attempt.isOvertime && <span className="ml-1 text-[11px]">超過</span>}
                      </span>
                      <span className="text-xs text-fg-faint sm:text-right">{attempt.assistUsed ? "アシストあり" : "アシストなし"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </>
  )
}
