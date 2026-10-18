import type { Metadata } from "next"
import React from "react"

import DemographicCard from "@/components/demo/ecommerce/DemographicCard"
import { EcommerceMetrics } from "@/components/demo/ecommerce/EcommerceMetrics"
import MonthlySalesChart from "@/components/demo/ecommerce/MonthlySalesChart"
import MonthlyTarget from "@/components/demo/ecommerce/MonthlyTarget"
import RecentOrders from "@/components/demo/ecommerce/RecentOrders"
import StatisticsChart from "@/components/demo/ecommerce/StatisticsChart"

export const metadata: Metadata = {
  title: "Ecommerce",
}

export default function Ecommerce() {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12 space-y-6 xl:col-span-7">
        <EcommerceMetrics />

        <MonthlySalesChart />
      </div>

      <div className="col-span-12 xl:col-span-5">
        <MonthlyTarget />
      </div>

      <div className="col-span-12">
        <StatisticsChart />
      </div>

      <div className="col-span-12 xl:col-span-5">
        <DemographicCard />
      </div>

      <div className="col-span-12 xl:col-span-7">
        <RecentOrders />
      </div>
    </div>
  )
}
