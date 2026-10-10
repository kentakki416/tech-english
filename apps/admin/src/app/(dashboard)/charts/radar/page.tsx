import { Metadata } from "next"
import React from "react"

import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import RadarChartOne from "@/components/ui/charts/radar/RadarChartOne"
import RadarChartThree from "@/components/ui/charts/radar/RadarChartThree"
import RadarChartTwo from "@/components/ui/charts/radar/RadarChartTwo"

export const metadata: Metadata = {
  title: "Next.js Radar Chart | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Radar Chart page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
}

export default function RadarChart() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Radar Chart" />
      <div className="space-y-6">
        <ComponentCard title="Radar Chart 1">
          <RadarChartOne />
        </ComponentCard>
        <ComponentCard title="Radar Chart 2">
          <RadarChartTwo />
        </ComponentCard>
        <ComponentCard title="Radar Chart 3">
          <RadarChartThree />
        </ComponentCard>
      </div>
    </div>
  )
}
