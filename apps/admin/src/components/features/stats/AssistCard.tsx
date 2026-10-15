import type { GetAdminStatsOverviewResponse } from "@repo/api-schema"

import { formatRate } from "@/libs/format-stats"

type AssistRates = GetAdminStatsOverviewResponse["assist_rates"]

const ASSISTS: { key: keyof AssistRates, label: string }[] = [
  { key: "translated", label: "段落の和訳" },
  { key: "looked_up", label: "単語の意味" },
  { key: "listened", label: "読み上げ" },
]

/**
 * アシストの利用率（解いたうち、各アシストを 1 回以上使った割合）を横棒で並べる
 */
export function AssistCard({ rates }: { rates: AssistRates }) {
  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white px-5 py-5 sm:px-6 sm:py-6 dark:border-gray-800 dark:bg-white/3">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">アシストの利用率</h3>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">解いたうち、1 回以上使った割合</p>
      <ul className="mt-6 space-y-5">
        {ASSISTS.map(assist => (
          <li key={assist.key}>
            <div className="flex items-baseline justify-between text-theme-sm">
              <span className="text-gray-700 dark:text-gray-300">{assist.label}</span>
              <span className="font-semibold text-gray-800 tabular-nums dark:text-white/90">{formatRate(rates[assist.key])}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-gray-800">
              <div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.round((rates[assist.key] ?? 0) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
