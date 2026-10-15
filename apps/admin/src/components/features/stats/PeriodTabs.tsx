import Link from "next/link"

import type { AdminStatsPeriod } from "@repo/api-schema"

import { formatPeriodLabel, STATS_PERIOD_ORDER } from "@/features/stats/stats.labels"

/**
 * 期間の切り替え（直近 7 日・30 日・全期間）。テンプレートの ChartTab と同じ見た目のリンクで、押すと buildHref の URL（?period= を変えたもの）へ移る
 */
export function PeriodTabs({ buildHref, current }: { buildHref: (period: AdminStatsPeriod) => string, current: AdminStatsPeriod }) {
  return (
    <nav aria-label="集計の期間" className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
      {STATS_PERIOD_ORDER.map(period => (
        <Link
          key={period}
          aria-current={period === current ? "page" : undefined}
          className={`rounded-md px-3 py-2 text-theme-sm font-medium whitespace-nowrap hover:text-gray-900 dark:hover:text-white ${
            period === current ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          href={buildHref(period)}
          scroll={false}
        >
          {formatPeriodLabel(period)}
        </Link>
      ))}
    </nav>
  )
}
