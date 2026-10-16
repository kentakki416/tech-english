import { Metadata } from "next"
import React from "react"

import LineChartOne from "@/components/demo/charts/line/LineChartOne"
import LineChartThree from "@/components/demo/charts/line/LineChartThree"
import LineChartTwo from "@/components/demo/charts/line/LineChartTwo"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "Line Chart",
}
export default function LineChart() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Line Chart" />
      <div className="space-y-6">
        <ComponentCard title="Line Chart 1">
          <LineChartOne />
        </ComponentCard>
        <ComponentCard title="Line Chart 2">
          <LineChartTwo />
        </ComponentCard>
        <ComponentCard title="Line Chart 3">
          <LineChartThree />
        </ComponentCard>
      </div>
    </div>
  )
}
