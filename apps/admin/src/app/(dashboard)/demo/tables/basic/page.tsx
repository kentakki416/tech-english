import { Metadata } from "next"
import React from "react"

import BasicTableFive from "@/components/demo/example/BasicTableFive"
import BasicTableFour from "@/components/demo/example/BasicTableFour"
import BasicTableOne from "@/components/demo/example/BasicTableOne"
import BasicTableThree from "@/components/demo/example/BasicTableThree"
import BasicTableTwo from "@/components/demo/example/BasicTableTwo"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "Basic Tables",
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
