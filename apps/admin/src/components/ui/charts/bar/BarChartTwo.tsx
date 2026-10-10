"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

export default function BarChartTwo() {
  const options: ApexOptions = {
    colors: ["#2a3bff", "#465fff", "#7f96ff", "#c2d0ff"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 315,
      stacked: true,
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "39%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: false,
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
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Outfit",
    },
    yaxis: {
      title: {
        text: undefined,
      },
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
        formatter: (val: number) => `${val}`,
      },
    },
  }
  const series = [
    {
      name: "Direct",
      data: [44, 55, 41, 67, 22, 43, 36, 52, 24, 18, 36, 48],
    },
    {
      name: "Referral",
      data: [13, 23, 20, 8, 13, 27, 15, 19, 28, 22, 19, 17],
    },
    {
      name: "Organic Search",
      data: [11, 17, 15, 15, 21, 14, 25, 18, 16, 20, 14, 22],
    },
    {
      name: "Social",
      data: [21, 7, 25, 13, 22, 8, 15, 12, 18, 20, 16, 15],
    },
  ]
  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartBarTwo" className="min-w-[1000px]">
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
