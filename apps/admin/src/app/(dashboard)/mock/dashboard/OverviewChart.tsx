"use client"

import type { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"

import type { MockOverview } from "@/libs/mock-data"

import { formatShortDate } from "../_components/stats-format"

/**
 * ApexCharts はブラウザでしか動かないので、テンプレートの StatisticsChart と同じく ssr: false で読む
 */
const Chart = dynamic(async () => import("react-apexcharts"), { ssr: false })

/**
 * 横軸のラベルの数の上限。点がこの 2 倍より多い（30 日の日ごと・全期間の週ごと）ときは、ラベルが重ならないよう 8 つまでに間引く（7 日はすべて出す）
 */
const MAX_X_LABELS = 8

/**
 * 推移の折れ線（学習したユーザー数・解いた回数・新規登録数）。7 日・30 日は日ごと、全期間は週ごと
 */
export function OverviewChart({ overview }: { overview: MockOverview }) {
  const categories = overview.points.map(point => (overview.bucket === "week" ? `${formatShortDate(point.date)}〜` : formatShortDate(point.date)))
  const options: ApexOptions = {
    chart: { fontFamily: "Outfit, sans-serif", toolbar: { show: false }, type: "line", zoom: { enabled: false } },
    colors: ["#465FFF", "#12B76A", "#F79009"],
    dataLabels: { enabled: false },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    legend: { fontSize: "13px", horizontalAlign: "left", markers: { size: 5 }, position: "top" },
    markers: { hover: { size: 5 }, size: 0, strokeColors: "#fff", strokeWidth: 2 },
    stroke: { curve: "smooth", width: 2 },
    tooltip: { shared: true },
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      categories,
      labels: { hideOverlappingLabels: true, rotate: 0, style: { colors: "#6B7280", fontSize: "12px" } },
      tickAmount: overview.points.length > MAX_X_LABELS * 2 ? MAX_X_LABELS : undefined,
      tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { colors: ["#6B7280"], fontSize: "12px" } }, min: 0 },
  }
  const series = [
    { data: overview.points.map(point => point.activeUsers), name: "学習したユーザー" },
    { data: overview.points.map(point => point.solvedAttempts), name: "解いた回数" },
    { data: overview.points.map(point => point.newUsers), name: "新規登録" },
  ]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pt-5 pb-3 sm:px-6 sm:pt-6 dark:border-gray-800 dark:bg-white/3">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">推移</h3>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{overview.bucket === "week" ? "週ごと（月曜始まり）" : "日ごと"}・日本時間</p>
      <div className="custom-scrollbar mt-2 max-w-full overflow-x-auto">
        <div className="min-w-[640px] xl:min-w-full">
          <Chart height={300} options={options} series={series} type="line" />
        </div>
      </div>
    </div>
  )
}
