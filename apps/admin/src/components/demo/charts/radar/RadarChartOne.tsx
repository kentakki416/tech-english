"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

import { useTheme } from "@/features/theme/theme.context"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

export default function RadarChartOne() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const options: ApexOptions = {
    colors: ["#465fff"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "radar",
      height: 340,
      toolbar: {
        show: false,
      },
    },
    xaxis: {
      categories: [
        "Estonia",
        "Germany",
        "France",
        "Spain",
        "Italy",
        "Canada",
        "Japan",
        "Brazil",
      ],
      labels: {
        style: {
          colors: isDark ? "#98a2b3" : "#667085",
        },
      },
    },
    fill: {
      opacity: 0.3,
    },
    stroke: {
      width: 3,
    },
    markers: {
      size: 4,
      colors: ["#465fff"],
      strokeColors: isDark ? "#1a2535" : "#fff",
      strokeWidth: 2,
    },
    dataLabels: {
      enabled: false,
    },
    plotOptions: {
      radar: {
        polygons: {
          strokeColors: isDark ? "#313d4f" : "#e4e7ec",
          connectorColors: isDark ? "#313d4f" : "#e4e7ec",
          fill: {
            colors: isDark ? ["#1e2d40", "#1a2535"] : ["#ffffff"],
          },
        },
      },
    },
  }
  const series = [
    {
      name: "Score",
      data: [8, 6, 3, 5, 4, 3, 5, 6],
    },
  ]
  return (
    <div className="mx-auto max-w-[480px]">
      <ReactApexChart
        options={options}
        series={series}
        type="radar"
        height={340}
      />
    </div>
  )
}
