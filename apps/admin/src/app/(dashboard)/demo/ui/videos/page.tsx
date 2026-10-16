import { Metadata } from "next"
import React from "react"

import VideosExample from "@/components/demo/example/VideosExample"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "Videos",
}

export default function VideoPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Videos" />

      <VideosExample />
    </div>
  )
}
