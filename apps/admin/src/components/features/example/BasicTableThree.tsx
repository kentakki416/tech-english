import Image from "next/image"
import React from "react"

import Badge from "@/components/ui/badge/Badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Transaction {
  id: number;
  name: string;
  icon: string;
  date: string;
  price: string;
  category: string;
  status: "Success" | "Pending" | "Failed";
}

const tableData: Transaction[] = [
  {
    id: 1,
    name: "Bought PYPL",
    icon: "/images/brand/brand-07.svg",
    date: "Nov 23, 01:00 PM",
    price: "$2,567.88",
    category: "Finance",
    status: "Success",
  },
  {
    id: 2,
    name: "Bought AAPL",
    icon: "/images/brand/brand-08.svg",
    date: "Nov 22, 09:00 PM",
    price: "$2,567.88",
    category: "Technology",
    status: "Pending",
  },
  {
    id: 3,
    name: "Sell KKST",
    icon: "/images/brand/brand-01.svg",
    date: "Oct 12, 03:54 PM",
    price: "$6,754.99",
    category: "Finance",
    status: "Success",
  },
  {
    id: 4,
    name: "Bought FB",
    icon: "/images/brand/brand-05.svg",
    date: "Sep 09, 02:00 AM",
    price: "$1,445.41",
    category: "Social media",
    status: "Success",
  },
  {
    id: 5,
    name: "Sell AMZN",
    icon: "/images/brand/brand-02.svg",
    date: "Feb 35, 08:00 PM",
    price: "$5,698.55",
    category: "E-commerce",
    status: "Failed",
  },
]

const statusColor = (status: Transaction["status"]) => {
  if (status === "Success") return "success"
  if (status === "Pending") return "warning"
  return "error"
}

export default function BasicTableThree() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Latest Transactions
        </h3>
        <input
          type="text"
          placeholder="Search..."
          className="h-10 rounded-lg border border-gray-200 bg-transparent px-4 text-sm text-gray-700 focus:outline-none dark:border-white/10 dark:text-gray-300"
        />
      </div>
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[900px]">
          <Table>
            <TableHeader className="border-y border-gray-100 dark:border-white/5">
              <TableRow>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Name
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Date
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Price
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Category
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
              {tableData.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="px-5 py-4 text-start">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 overflow-hidden rounded-full">
                        <Image
                          width={32}
                          height={32}
                          src={tx.icon}
                          alt={tx.name}
                        />
                      </div>
                      <span className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {tx.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {tx.date}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {tx.price}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {tx.category}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-start">
                    <Badge size="sm" color={statusColor(tx.status)}>
                      {tx.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-gray-100 px-5 py-4 dark:border-white/5">
        <button className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 dark:border-white/10 dark:text-gray-300">
          Previous
        </button>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 font-medium text-brand-500 dark:bg-brand-500/15">
            1
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400">
            2
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400">
            3
          </span>
          <span className="px-1 text-gray-500 dark:text-gray-400">...</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400">
            8
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400">
            9
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400">
            10
          </span>
        </div>
        <button className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 dark:border-white/10 dark:text-gray-300">
          Next
        </button>
      </div>
    </div>
  )
}
