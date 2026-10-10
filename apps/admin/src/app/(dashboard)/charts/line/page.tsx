import { Metadata } from "next"
import React from "react"

import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import LineChartOne from "@/components/ui/charts/line/LineChartOne"
import LineChartThree from "@/components/ui/charts/line/LineChartThree"
import LineChartTwo from "@/components/ui/charts/line/LineChartTwo"

export const metadata: Metadata = {
  title: "Next.js Line Chart | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Line Chart page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
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
