import { Metadata } from "next"
import React from "react"

import Calendar from "@/components/demo/calendar/Calendar"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "Calendar",
}
export default function page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Calendar" />
      <Calendar />
    </div>
  )
}
