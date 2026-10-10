import { Metadata } from "next"
import React from "react"

import BasicTableFive from "@/components/features/example/BasicTableFive"
import BasicTableFour from "@/components/features/example/BasicTableFour"
import BasicTableOne from "@/components/features/example/BasicTableOne"
import BasicTableThree from "@/components/features/example/BasicTableThree"
import BasicTableTwo from "@/components/features/example/BasicTableTwo"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "Next.js Basic Table | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Basic Table  page for TailAdmin  Tailwind CSS Admin Dashboard Template",
  // other metadata
}

export default function BasicTables() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Basic Table" />
      <div className="space-y-6">
        <ComponentCard title="Basic Table 1">
          <BasicTableOne />
        </ComponentCard>
        <ComponentCard title="Basic Table 2">
          <BasicTableTwo />
        </ComponentCard>
        <ComponentCard title="Basic Table 3">
          <BasicTableThree />
        </ComponentCard>
        <ComponentCard title="Basic Table 4">
          <BasicTableFour />
        </ComponentCard>
        <ComponentCard title="Basic Table 5">
          <BasicTableFive />
        </ComponentCard>
      </div>
    </div>
  )
}
