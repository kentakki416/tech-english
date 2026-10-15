"use client"

import type { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"

import type { GetAdminStatsOverviewResponse } from "@repo/api-schema"

import { formatShortDate } from "@/libs/format-stats"

/**
 * ApexCharts はブラウザでしか動かないので、テンプレートの StatisticsChart と同じく ssr: false で読む
 */
const Chart = dynamic(async () => import("react-apexcharts"), { ssr: false })

/**
 * 横軸のラベルの数の上限。点がこの 2 倍より多い（30 日の日ごと・全期間の週ごと）ときは、ラベルが重ならないよう 8 つまでに間引く（7 日はすべて出す）
 */
const MAX_X_LABELS = 8

/**
 * 折れ線 3 本の名前・線の色（ApexCharts）・凡例の点の色（同じ色の Tailwind のクラス）
 */
const SERIES_STYLES = [
  { color: "#465FFF", dotClass: "bg-brand-500", name: "学習したユーザー" },
  { color: "#12B76A", dotClass: "bg-success-500", name: "解いた回数" },
  { color: "#F79009", dotClass: "bg-warning-500", name: "新規登録" },
] as const

/**
 * 推移の折れ線（学習したユーザー数・解いた回数・新規登録数）。7 日・30 日は日ごと、全期間は週ごと。
 * 狭い画面で横にスクロールするときは、直近（右端）から見せる（dir="rtl"。グラフの中は左から右のまま）。
 * 凡例はスクロールで隠れないよう、ApexCharts の凡例を使わずにグラフの外に出す
 */
export function OverviewChart({ series }: { series: GetAdminStatsOverviewResponse["series"] }) {
  const categories = series.points.map(point => (series.bucket === "week" ? `${formatShortDate(point.date)}〜` : formatShortDate(point.date)))
  const options: ApexOptions = {
    chart: { fontFamily: "Outfit, sans-serif", toolbar: { show: false }, type: "line", zoom: { enabled: false } },
    colors: SERIES_STYLES.map(style => style.color),
    dataLabels: { enabled: false },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    legend: { show: false },
    /**
     * 点が 1 つ（全期間で最初の登録が今週など）だと線が引けないので、点を出す
     */
    markers: { hover: { size: 5 }, size: series.points.length === 1 ? 5 : 0, strokeColors: "#fff", strokeWidth: 2 },
    stroke: { curve: "smooth", width: 2 },
    tooltip: { shared: true },
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      categories,
      labels: { hideOverlappingLabels: true, rotate: 0, style: { colors: "#6B7280", fontSize: "12px" } },
      tickAmount: series.points.length > MAX_X_LABELS * 2 ? MAX_X_LABELS : undefined,
      tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { colors: ["#6B7280"], fontSize: "12px" } }, min: 0 },
  }
  const chartSeries = [
    { data: series.points.map(point => point.active_users), name: SERIES_STYLES[0].name },
    { data: series.points.map(point => point.solved_attempts), name: SERIES_STYLES[1].name },
    { data: series.points.map(point => point.new_users), name: SERIES_STYLES[2].name },
  ]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pt-5 pb-3 sm:px-6 sm:pt-6 dark:border-gray-800 dark:bg-white/3">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">推移</h3>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{series.bucket === "week" ? "週ごと（月曜始まり）" : "日ごと"}・日本時間</p>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gray-600 dark:text-gray-400">
        {SERIES_STYLES.map(style => (
          <li key={style.name} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${style.dotClass}`} />
            {style.name}
          </li>
        ))}
      </ul>
      <div className="custom-scrollbar mt-2 max-w-full overflow-x-auto" dir="rtl">
        <div className="min-w-[640px] xl:min-w-full" dir="ltr">
          <Chart height={300} options={options} series={chartSeries} type="line" />
        </div>
      </div>
    </div>
  )
}
