"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

import { useTheme } from "@/features/theme/theme.context"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

export default function PieChartTwo() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const options: ApexOptions = {
    colors: ["#a78bfa", "#fb923c", "#fbbf24", "#34d399"],
    labels: ["Downloads", "Apps", "Documents", "Media"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "donut",
      height: 300,
    },
    stroke: {
      show: false,
    },
    plotOptions: {
      pie: {
        donut: {
          size: "70%",
          labels: {
            show: true,
            /**
             * name / value を表示し total.showAlways を false にすることで、
             * ホバー時はそのセグメントの名前・値、非ホバー時は total を中央に表示する（demo と同じ挙動）
             */
            name: {
              show: true,
              fontFamily: "Outfit, sans-serif",
              fontSize: "16px",
              color: isDark ? "#98a2b3" : "#667085",
            },
            value: {
              show: true,
              fontFamily: "Outfit, sans-serif",
              fontSize: "24px",
              fontWeight: 600,
              color: isDark ? "#ffffff" : "#1d2939",
              formatter: (val) => `${val}`,
            },
            total: {
              show: true,
              showAlways: false,
              label: "Total 135 GB",
              fontFamily: "Outfit, sans-serif",
              fontSize: "16px",
              color: isDark ? "#98a2b3" : "#667085",
              formatter: () => "160",
            },
          },
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    legend: {
      show: false,
    },
  }
  const series = [40, 45, 35, 40]
  return (
    <div className="mx-auto max-w-[420px]">
      <ReactApexChart
        options={options}
        series={series}
        type="donut"
        height={300}
      />
    </div>
  )
}
