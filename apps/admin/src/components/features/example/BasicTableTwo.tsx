import React from "react"

import Badge from "@/components/ui/badge/Badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Deal {
  id: number;
  dealId: string;
  customer: {
    name: string;
    email: string;
    initials: string;
    color: string;
  };
  product: string;
  dealValue: string;
  closeDate: string;
  status: "Complete" | "Pending";
}

const tableData: Deal[] = [
  {
    id: 1,
    dealId: "DE124321",
    customer: {
      name: "John Doe",
      email: "johndeo@gmail.com",
      initials: "JD",
      color: "bg-blue-100 text-blue-600",
    },
    product: "Software License",
    dealValue: "$18,50.34",
    closeDate: "2024-06-15",
    status: "Complete",
  },
  {
    id: 2,
    dealId: "DE124321",
    customer: {
      name: "Kierra Franci",
      email: "kierra@gmail.com",
      initials: "KF",
      color: "bg-pink-100 text-pink-600",
    },
    product: "Software License",
    dealValue: "$18,50.34",
    closeDate: "2024-06-15",
    status: "Complete",
  },
  {
    id: 3,
    dealId: "DE124321",
    customer: {
      name: "Emerson Workman",
      email: "emerson@gmail.com",
      initials: "EW",
      color: "bg-sky-100 text-sky-600",
    },
    product: "Software License",
    dealValue: "$18,50.34",
    closeDate: "2024-06-15",
    status: "Pending",
  },
  {
    id: 4,
    dealId: "DE124321",
    customer: {
      name: "Chance Philips",
      email: "chance@gmail.com",
      initials: "CP",
      color: "bg-orange-100 text-orange-600",
    },
    product: "Software License",
    dealValue: "$18,50.34",
    closeDate: "2024-06-15",
    status: "Complete",
  },
  {
    id: 5,
    dealId: "DE124321",
    customer: {
      name: "Terry Geidt",
      email: "terry@gmail.com",
      initials: "TG",
      color: "bg-green-100 text-green-600",
    },
    product: "Software License",
    dealValue: "$18,50.34",
    closeDate: "2024-06-15",
    status: "Complete",
  },
]

export default function BasicTableTwo() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Recent Orders
        </h3>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search..."
            className="h-10 rounded-lg border border-gray-200 bg-transparent px-4 text-sm text-gray-700 focus:outline-none dark:border-white/10 dark:text-gray-300"
          />
          <button className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 dark:border-white/10 dark:text-gray-300">
            Filter
          </button>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[1102px]">
          <Table>
            <TableHeader className="border-y border-gray-100 dark:border-white/5">
              <TableRow>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Deal ID
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Customer
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Product/Service
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Deal Value
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Close Date
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Status
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
              {tableData.map((deal) => (
                <TableRow key={deal.id}>
                  <TableCell className="px-5 py-4 text-gray-700 text-start text-theme-sm dark:text-gray-300">
                    {deal.dealId}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-start">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-theme-xs font-medium ${deal.customer.color}`}
                      >
                        {deal.customer.initials}
                      </span>
                      <div>
                        <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {deal.customer.name}
                        </span>
                        <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                          {deal.customer.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {deal.product}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {deal.dealValue}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {deal.closeDate}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-start">
                    <Badge
                      size="sm"
                      color={deal.status === "Complete" ? "success" : "warning"}
                    >
                      {deal.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
