"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

const BAR_COUNT = 30

/**
 * 2 つの値を ratio (0〜1) で線形補間する
 */
const lerp = (start: number, end: number, ratio: number) =>
  Math.round(start + (end - start) * ratio)

/**
 * 左端の青 (#465fff) から右端のグレー (#d1d5db) へ、棒ごとに色を割り当てる。
 * distributed: true と組み合わせることで demo と同じ「横方向に青→グレー」の見た目になる。
 */
const barColors = Array.from({ length: BAR_COUNT }, (_, index) => {
  const ratio = index / (BAR_COUNT - 1)
  return `rgb(${lerp(70, 209, ratio)}, ${lerp(95, 213, ratio)}, ${lerp(255, 219, ratio)})`
})

export default function BarChartThree() {
  const options: ApexOptions = {
    colors: barColors,
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 180,
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        distributed: true,
        horizontal: false,
        columnWidth: "80%",
        borderRadius: 2,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: false,
    },
    fill: {
      opacity: 1,
    },
    xaxis: {
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
    tooltip: {
      x: {
        show: false,
      },
    },
  }
  const series = [
    {
      name: "Value",
      data: Array.from({ length: BAR_COUNT }, () => 100),
    },
  ]
  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartBarThree" className="min-w-[1000px]">
        <ReactApexChart
          options={options}
          series={series}
          type="bar"
          height={180}
        />
      </div>
    </div>
  )
}
