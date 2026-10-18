import { Metadata } from "next"
import React from "react"

import PieChartFour from "@/components/demo/charts/pie/PieChartFour"
import PieChartOne from "@/components/demo/charts/pie/PieChartOne"
import PieChartThree from "@/components/demo/charts/pie/PieChartThree"
import PieChartTwo from "@/components/demo/charts/pie/PieChartTwo"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "Pie Chart",
}

export default function PieChart() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Pie Chart" />
      <div className="space-y-6">
        <ComponentCard title="Donut Pie Chart 1">
          <PieChartOne />
        </ComponentCard>
        <ComponentCard title="Donut Pie Chart 2">
          <PieChartTwo />
        </ComponentCard>
        <ComponentCard title="Donut Pie Chart 3">
          <PieChartThree />
        </ComponentCard>
        <ComponentCard title="Donut Pie Chart 4">
          <PieChartFour />
        </ComponentCard>
      </div>
    </div>
  )
}
