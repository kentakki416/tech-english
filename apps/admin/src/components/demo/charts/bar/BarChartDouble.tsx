"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

export default function BarChartDouble() {
  const options: ApexOptions = {
    colors: ["#465fff", "#c2d0ff"],
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
        horizontal: false,
        columnWidth: "70%",
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
      categories: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      max: 100,
      labels: {
        formatter: (val: number) => `${val}%`,
      },
    },
    legend: {
      show: false,
    },
    grid: {
      yaxis: {
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
      y: {
        formatter: (val: number) => `${val}%`,
      },
    },
  }
  const series = [
    {
      name: "Series 1",
      data: [79, 59, 63, 39, 77, 43, 74, 89, 57, 68, 89, 94],
    },
    {
      name: "Series 2",
      data: [88, 48, 66, 22, 55, 66, 28, 55, 46, 44, 74, 43],
    },
  ]
  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartBarDouble" className="min-w-[1000px]">
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
