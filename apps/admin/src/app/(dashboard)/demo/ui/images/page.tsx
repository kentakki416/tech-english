import { Metadata } from "next"
import React from "react"

import ResponsiveImage from "@/components/demo/images/ResponsiveImage"
import ThreeColumnImageGrid from "@/components/demo/images/ThreeColumnImageGrid"
import TwoColumnImageGrid from "@/components/demo/images/TwoColumnImageGrid"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "Images",
}

export default function Images() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Images" />
      <div className="space-y-5 sm:space-y-6">
        <ComponentCard title="Responsive image">
          <ResponsiveImage />
        </ComponentCard>
        <ComponentCard title="Image in 2 Grid">
          <TwoColumnImageGrid />
        </ComponentCard>
        <ComponentCard title="Image in 3 Grid">
          <ThreeColumnImageGrid />
        </ComponentCard>
      </div>
    </div>
  )
}
