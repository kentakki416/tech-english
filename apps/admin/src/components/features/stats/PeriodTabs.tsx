import Link from "next/link"

import type { AdminStatsPeriod } from "@repo/api-schema"

const PERIOD_LABELS: Record<AdminStatsPeriod, string> = {
  "30d": "直近 30 日",
  "7d": "直近 7 日",
  all: "全期間",
}

const PERIOD_ORDER = ["7d", "30d", "all"] as const satisfies readonly AdminStatsPeriod[]

export const formatPeriodLabel = (period: AdminStatsPeriod): string => PERIOD_LABELS[period]

/**
 * 期間の切り替え（直近 7 日・30 日・全期間）。テンプレートの ChartTab と同じ見た目のリンクで、押すと URL の ?period= を変える
 */
export function PeriodTabs({ current, hrefByPeriod }: { current: AdminStatsPeriod, hrefByPeriod: Record<AdminStatsPeriod, string> }) {
  return (
    <nav aria-label="集計の期間" className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
      {PERIOD_ORDER.map(period => (
        <Link
          key={period}
          aria-current={period === current ? "page" : undefined}
          className={`rounded-md px-3 py-2 text-theme-sm font-medium whitespace-nowrap hover:text-gray-900 dark:hover:text-white ${
            period === current ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          href={hrefByPeriod[period]}
          scroll={false}
        >
          {PERIOD_LABELS[period]}
        </Link>
      ))}
    </nav>
  )
}
