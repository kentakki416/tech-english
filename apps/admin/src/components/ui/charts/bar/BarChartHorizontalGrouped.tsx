"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

export default function BarChartHorizontalGrouped() {
  const options: ApexOptions = {
    colors: ["#465fff", "#e5e7eb"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 315,
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: "55%",
        borderRadius: 4,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 4,
      colors: ["transparent"],
    },
    xaxis: {
      categories: ["Jan", "Feb", "Mar", "Apr", "May"],
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      title: {
        text: undefined,
      },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Outfit",
    },
    grid: {
      xaxis: {
        lines: {
          show: true,
        },
      },
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
    {
      name: "Category A",
      data: [610, 500, 480, 610, 610],
    },
    {
      name: "Category B",
      data: [350, 500, 390, 200, 350],
    },
  ]
  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartBarHorizontalGrouped" className="min-w-[1000px]">
        <ReactApexChart
          options={options}
          series={series}
          type="bar"
          height={315}
        />
      </div>
    </div>
  )
}
