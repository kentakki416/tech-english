"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

import { useTheme } from "@/features/theme/theme.context"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

export default function RadarChartThree() {
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
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
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
      width: 2,
    },
    markers: {
      size: 4,
      colors: ["#465fff"],
      strokeColors: isDark ? "#1a2535" : "#fff",
      strokeWidth: 2,
    },
    /**
     * 各頂点に値を表示する（demo Radar 3 と同じ）
     */
    dataLabels: {
      enabled: true,
    },
    plotOptions: {
      radar: {
        polygons: {
          strokeColors: isDark ? "#313d4f" : "#e4e7ec",
          connectorColors: isDark ? "#313d4f" : "#e4e7ec",
          /**
           * 同心の polygon を交互に塗る（demo と同じ。ライトはグレー/白、ダークはネイビー2色）
           */
          fill: {
            colors: isDark ? ["#1e2d40", "#1a2535"] : ["#f2f4f7", "#ffffff"],
          },
        },
      },
    },
  }
  const series = [
    {
      name: "Sales",
      data: [100, 40, 60, 60, 60, 80, 20],
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
