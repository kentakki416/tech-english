import { Metadata } from "next"
import React from "react"

import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import PieChartFour from "@/components/ui/charts/pie/PieChartFour"
import PieChartOne from "@/components/ui/charts/pie/PieChartOne"
import PieChartThree from "@/components/ui/charts/pie/PieChartThree"
import PieChartTwo from "@/components/ui/charts/pie/PieChartTwo"

export const metadata: Metadata = {
  title: "Next.js Pie Chart | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Pie Chart page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
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
