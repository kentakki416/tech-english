import type { Metadata } from "next"
import { connection } from "next/server"

import type { AdminStatsPeriod } from "@repo/api-schema"

import { AssistCard } from "@/components/features/stats/AssistCard"
import { OverviewCards } from "@/components/features/stats/OverviewCards"
import { OverviewChart } from "@/components/features/stats/OverviewChart"
import { PassageStatsTable } from "@/components/features/stats/PassageStatsTable"
import { PeriodTabs } from "@/components/features/stats/PeriodTabs"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { statsApi } from "@/features/stats/stats.api"
import { buildDashboardHref, convertSearchParamsToDashboardQuery } from "@/features/stats/stats.params"

export const metadata: Metadata = {
  title: "ダッシュボード | tech-english admin",
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * ダッシュボード（admin のトップ）。期間の切り替え、全体の利用状況（数字のカード・推移・アシストの利用率）、問題ごとの成績（admin-dashboard の UI 設計）
 */
export default async function DashboardPage({ searchParams }: Props) {
  await connection()
  const query = convertSearchParamsToDashboardQuery(await searchParams)
  const [overview, list] = await Promise.all([statsApi.getOverview(query.period), statsApi.getPassageList(query)])
  const hrefByPeriod = Object.fromEntries(
    (["7d", "30d", "all"] as const).map(period => [period, buildDashboardHref({ ...query, page: 1, period })]),
  ) as Record<AdminStatsPeriod, string>

  return (
    <>
      <PageBreadcrumb pageTitle="ダッシュボード" />
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PeriodTabs current={query.period} hrefByPeriod={hrefByPeriod} />
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            {overview.from} 〜 {overview.to}（日本時間）
          </p>
        </div>
        <OverviewCards overview={overview} />
        <div className="grid grid-cols-12 gap-4 md:gap-6">
          <div className="col-span-12 xl:col-span-8">
            <OverviewChart series={overview.series} />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <AssistCard rates={overview.assist_rates} />
          </div>
        </div>
        <PassageStatsTable list={list} query={query} />
      </div>
    </>
  )
}
