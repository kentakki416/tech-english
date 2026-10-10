"use client"

import { ApexOptions } from "apexcharts"
import dynamic from "next/dynamic"
import React from "react"

const ReactApexChart = dynamic(async () => import("react-apexcharts"), {
  ssr: false,
})

export default function LineChartThree() {
  const options: ApexOptions = {
    legend: {
      show: false,
    },
    colors: ["#465FFF"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 310,
      type: "area",
      toolbar: {
        show: false,
      },
    },
    stroke: {
      curve: "straight",
      width: 2,
    },
    fill: {
      type: "gradient",
      gradient: {
        opacityFrom: 0.55,
        opacityTo: 0,
      },
    },
    markers: {
      size: 0,
      strokeColors: "#fff",
      strokeWidth: 2,
      hover: {
        size: 6,
      },
    },
    grid: {
      xaxis: {
        lines: {
          show: false,
        },
      },
      yaxis: {
        lines: {
          show: true,
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    tooltip: {
      enabled: true,
      x: {
        format: "dd MMM yyyy",
      },
    },
    xaxis: {
      /**
       * Line Chart 1 / 2 との違い: 月カテゴリではなく日付軸（datetime）で時系列を描画する
       */
      type: "datetime",
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      tooltip: {
        enabled: false,
      },
    },
    yaxis: {
      min: 28,
      max: 40,
      labels: {
        style: {
          fontSize: "12px",
          colors: ["#6B7280"],
        },
        formatter: (value) => value.toFixed(2),
      },
      title: {
        text: "",
        style: {
          fontSize: "0px",
        },
      },
    },
  }

  const series = [
    {
      name: "Price",
      data: [
        { x: "2025-06-01", y: 31.1 },
        { x: "2025-06-08", y: 32.0 },
        { x: "2025-06-15", y: 33.2 },
        { x: "2025-06-22", y: 32.7 },
        { x: "2025-07-01", y: 34.1 },
        { x: "2025-07-08", y: 34.6 },
        { x: "2025-07-15", y: 33.5 },
        { x: "2025-07-22", y: 34.0 },
        { x: "2025-08-01", y: 33.2 },
        { x: "2025-08-08", y: 32.5 },
        { x: "2025-08-15", y: 33.8 },
        { x: "2025-08-22", y: 32.9 },
        { x: "2025-09-01", y: 31.5 },
        { x: "2025-09-08", y: 29.8 },
        { x: "2025-09-15", y: 31.2 },
        { x: "2025-09-22", y: 32.0 },
        { x: "2025-10-01", y: 31.4 },
        { x: "2025-10-08", y: 32.3 },
        { x: "2025-10-15", y: 31.0 },
        { x: "2025-10-22", y: 30.4 },
        { x: "2025-11-01", y: 31.2 },
        { x: "2025-11-08", y: 30.0 },
        { x: "2025-11-15", y: 31.8 },
        { x: "2025-11-22", y: 32.5 },
        { x: "2025-12-01", y: 32.0 },
        { x: "2025-12-08", y: 33.4 },
        { x: "2025-12-15", y: 32.6 },
        { x: "2025-12-22", y: 33.9 },
        { x: "2026-01-01", y: 34.5 },
        { x: "2026-01-08", y: 33.6 },
        { x: "2026-01-15", y: 32.8 },
        { x: "2026-01-22", y: 33.5 },
        { x: "2026-02-01", y: 33.0 },
        { x: "2026-02-08", y: 33.9 },
        { x: "2026-02-15", y: 32.7 },
        { x: "2026-02-22", y: 33.4 },
        { x: "2026-03-01", y: 34.6 },
        { x: "2026-03-08", y: 35.2 },
        { x: "2026-03-15", y: 35.9 },
        { x: "2026-03-22", y: 35.5 },
      ],
    },
  ]

  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartThirteen" className="min-w-[1000px]">
        <ReactApexChart
          options={options}
          series={series}
          type="area"
          height={310}
        />
      </div>
    </div>
  )
}
