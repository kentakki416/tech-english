import type { ReactNode } from "react"

import type { GetAdminStatsOverviewResponse } from "@repo/api-schema"

import { BoltIcon, CheckCircleIcon, GroupIcon, PieChartIcon } from "@/icons"
import { formatCount, formatRate } from "@/libs/format-stats"

/**
 * 数字のカード 1 枚（テンプレートの EcommerceMetrics と同じ見た目）
 */
function MetricCard({ icon, label, note, value }: { icon: ReactNode, label: string, note: string, value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 dark:border-gray-800 dark:bg-white/3">
      <div className="flex size-12 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90">{icon}</div>
      <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-title-sm font-bold text-gray-800 tabular-nums dark:text-white/90">{value}</p>
      <p className="mt-1 text-theme-xs text-gray-400">{note}</p>
    </div>
  )
}

/**
 * 全体の利用状況の数字のカード（登録ユーザー・学習したユーザー・解いた回数・正答率）
 */
export function OverviewCards({ overview }: { overview: GetAdminStatsOverviewResponse }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
      <MetricCard
        icon={<GroupIcon className="size-6" />}
        label="登録ユーザー"
        note={`期間内の新規 ${formatCount(overview.new_users)} 人`}
        value={formatCount(overview.total_users)}
      />
      <MetricCard
        icon={<BoltIcon className="size-6" />}
        label="学習したユーザー"
        note="問題を解いた・単語帳で答えた人"
        value={formatCount(overview.active_users)}
      />
      <MetricCard
        icon={<CheckCircleIcon className="size-6" />}
        label="解いた回数"
        note={`解いた人数 ${formatCount(overview.solved_users)} 人`}
        value={formatCount(overview.solved_attempts)}
      />
      <MetricCard
        icon={<PieChartIcon className="size-6" />}
        label="正答率"
        note="解いた設問の合計で計算"
        value={formatRate(overview.correct_rate)}
      />
    </div>
  )
}
