import Link from "next/link"

import { type AdminStatsPeriod, STATS_PERIOD_LABELS } from "@/libs/mock-data"

const PERIODS: AdminStatsPeriod[] = ["7d", "30d", "all"]

/**
 * 期間の切り替え（直近 7 日・30 日・全期間）。テンプレートの ChartTab と同じ見た目で、押すと URL の ?period= を変える
 */
export function PeriodTabs({ basePath, current }: { basePath: string, current: AdminStatsPeriod }) {
  return (
    <nav aria-label="集計の期間" className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
      {PERIODS.map(period => (
        <Link
          key={period}
          aria-current={period === current ? "page" : undefined}
          className={`rounded-md px-3 py-2 text-theme-sm font-medium whitespace-nowrap hover:text-gray-900 dark:hover:text-white ${
            period === current ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          href={`${basePath}?period=${period}`}
          scroll={false}
        >
          {STATS_PERIOD_LABELS[period]}
        </Link>
      ))}
    </nav>
  )
}
