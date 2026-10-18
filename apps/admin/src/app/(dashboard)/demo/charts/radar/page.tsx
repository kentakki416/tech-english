import { Metadata } from "next"
import React from "react"

import RadarChartOne from "@/components/demo/charts/radar/RadarChartOne"
import RadarChartThree from "@/components/demo/charts/radar/RadarChartThree"
import RadarChartTwo from "@/components/demo/charts/radar/RadarChartTwo"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

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
