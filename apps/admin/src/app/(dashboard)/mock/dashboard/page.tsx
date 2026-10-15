import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { convertToStatsPeriod, convertToUnsolvedPassageStats, MOCK_EMPTY_OVERVIEW, MOCK_OVERVIEWS, MOCK_PASSAGE_STATS } from "@/libs/mock-data"

import { MockStatePanel } from "../_components/MockStatePanel"
import { PeriodTabs } from "../_components/PeriodTabs"

import { AssistCard } from "./AssistCard"
import { OverviewCards } from "./OverviewCards"
import { OverviewChart } from "./OverviewChart"
import { PassageStatsTable } from "./PassageStatsTable"

const STATES = [
  { href: "/mock/dashboard?period=30d", key: "30d", label: "直近 30 日（初期表示）" },
  { href: "/mock/dashboard?period=7d", key: "7d", label: "直近 7 日" },
  { href: "/mock/dashboard?period=all", key: "all", label: "全期間（週ごと）" },
  { href: "/mock/dashboard?state=empty", key: "empty", label: "まだ誰も学習していない" },
]

/**
 * ダッシュボード（モック）。本実装では admin のトップ（/）に置く
 */
export default async function MockDashboardPage({ searchParams }: { searchParams: Promise<{ period?: string, state?: string }> }) {
  const { period: rawPeriod, state } = await searchParams
  const isEmpty = state === "empty"
  const period = convertToStatsPeriod(rawPeriod)
  const overview = isEmpty ? MOCK_EMPTY_OVERVIEW : MOCK_OVERVIEWS[period]
  const rows = isEmpty ? convertToUnsolvedPassageStats(MOCK_PASSAGE_STATS["30d"]) : MOCK_PASSAGE_STATS[period]

  return (
    <>
      <PageBreadcrumb pageTitle="ダッシュボード" />
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PeriodTabs basePath="/mock/dashboard" current={period} />
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            {overview.from} 〜 {overview.to}（日本時間）
          </p>
        </div>
        <OverviewCards overview={overview} />
        <div className="grid grid-cols-12 gap-4 md:gap-6">
          <div className="col-span-12 xl:col-span-8">
            <OverviewChart overview={overview} />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <AssistCard rates={overview.assistRates} />
          </div>
        </div>
        <PassageStatsTable key={`${period}-${state ?? ""}`} period={period} rows={rows} />
      </div>
      <MockStatePanel current={isEmpty ? "empty" : period} states={STATES} />
    </>
  )
}
