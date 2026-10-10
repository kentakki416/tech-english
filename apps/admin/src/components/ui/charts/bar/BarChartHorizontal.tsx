"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

export default function BarChartHorizontal() {
  const options: ApexOptions = {
    colors: ["#465fff", "#38bdf8", "#c4b5fd", "#f9a8d4", "#34d399", "#d1d5db"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 120,
      stacked: true,
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: "45%",
        borderRadius: 4,
        borderRadiusApplication: "around",
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: false,
    },
    xaxis: {
      categories: ["Total"],
      labels: {
        show: false,
      },
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      labels: {
        show: false,
      },
    },
    legend: {
      show: false,
    },
    grid: {
      show: false,
    },
    fill: {
      opacity: 1,
    },
    tooltip: {
      x: {
        show: false,
      },
    },
  }
  const series = [
    { name: "Direct", data: [44] },
    { name: "Referral", data: [24] },
    { name: "Organic Search", data: [12] },
    { name: "Campaign", data: [20] },
    { name: "Social", data: [8] },
    { name: "Other", data: [14] },
  ]
  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartBarHorizontal" className="min-w-[1000px]">
        <ReactApexChart
          options={options}
          series={series}
          type="bar"
          height={120}
        />
      </div>
    </div>
  )
}
