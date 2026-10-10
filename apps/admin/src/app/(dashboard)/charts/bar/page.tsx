import { Metadata } from "next"
import React from "react"

import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import BarChartDouble from "@/components/ui/charts/bar/BarChartDouble"
import BarChartHorizontal from "@/components/ui/charts/bar/BarChartHorizontal"
import BarChartHorizontalGrouped from "@/components/ui/charts/bar/BarChartHorizontalGrouped"
import BarChartOne from "@/components/ui/charts/bar/BarChartOne"
import BarChartThree from "@/components/ui/charts/bar/BarChartThree"
import BarChartTwo from "@/components/ui/charts/bar/BarChartTwo"

export const metadata: Metadata = {
  title: "Next.js Bar Chart | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Bar Chart page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
}

export default function page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Bar Chart" />
      <div className="space-y-6">
        <ComponentCard title="Bar Chart 1">
          <BarChartOne />
        </ComponentCard>
        <ComponentCard title="Bar Chart 2">
          <BarChartTwo />
        </ComponentCard>
        <ComponentCard title="Bar Chart 3">
          <BarChartThree />
        </ComponentCard>
        <ComponentCard title="Horizontal Bar Chart">
          <BarChartHorizontal />
        </ComponentCard>
        <ComponentCard title="Double Bar Chart">
          <BarChartDouble />
        </ComponentCard>
        <ComponentCard title="Horizontal Grouped Bar Chart">
          <BarChartHorizontalGrouped />
        </ComponentCard>
      </div>
    </div>
  )
}
