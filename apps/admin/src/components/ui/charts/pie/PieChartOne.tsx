"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

import { useTheme } from "@/features/theme/theme.context"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

export default function PieChartOne() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const options: ApexOptions = {
    colors: ["#465fff", "#7592ff", "#c2d6ff"],
    labels: ["Desktop", "Mobile", "Tablet"],
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
          size: "65%",
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    legend: {
      show: true,
      position: "bottom",
      fontFamily: "Outfit",
      labels: {
        colors: isDark ? "#98a2b3" : "#667085",
      },
    },
  }
  const series = [45, 35, 20]
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
