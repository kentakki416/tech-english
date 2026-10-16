"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

import { useTheme } from "@/features/theme/theme.context"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

export default function RadarChartTwo() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const options: ApexOptions = {
    /**
     * 線は colors、塗りは fill.colors（demo は線と塗りで別色）
     */
    colors: ["#465fff", "#f05fb5"],
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
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
      labels: {
        style: {
          colors: isDark ? "#98a2b3" : "#667085",
        },
      },
    },
    fill: {
      opacity: 0.2,
      colors: ["#3641f5", "#ee46bc"],
    },
    stroke: {
      width: 2,
    },
    markers: {
      size: 3,
      strokeColors: isDark ? "#1a2535" : "#fff",
      strokeWidth: 2,
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
      name: "Desktop",
      data: [80, 50, 30, 40, 100, 20, 90, 60, 40, 70, 50, 80],
    },
    {
      name: "Mobile",
      data: [20, 30, 40, 80, 20, 80, 40, 50, 60, 30, 70, 40],
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
