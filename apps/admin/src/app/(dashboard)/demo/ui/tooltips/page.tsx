import { Metadata } from "next"
import React from "react"

import TooltipExample from "@/components/demo/example/TooltipExample"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "Tooltips",
}

export default function TooltipsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Tooltips" />
      <TooltipExample />
    </div>
  )
}
