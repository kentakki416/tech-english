import Image from "next/image"
import React from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Product {
  id: number;
  name: string;
  category: string;
  country: string;
  cr: string;
  value: string;
}

const tableData: Product[] = [
  {
    id: 1,
    name: "TailGrids",
    category: "UI Kit",
    country: "/images/country/country-01.svg",
    cr: "Dashboard",
    value: "$12,499",
  },
  {
    id: 2,
    name: "GrayGrids",
    category: "Templates",
    country: "/images/country/country-02.svg",
    cr: "Dashboard",
    value: "$5,498",
  },
  {
    id: 3,
    name: "Uideck",
    category: "Templates",
    country: "/images/country/country-03.svg",
    cr: "Dashboard",
    value: "$4,521",
  },
  {
    id: 4,
    name: "FormBold",
    category: "SaaS",
    country: "/images/country/country-04.svg",
    cr: "Dashboard",
    value: "$13,843",
  },
  {
    id: 5,
    name: "NextAdmin",
    category: "Dashboard",
    country: "/images/country/country-05.svg",
    cr: "Dashboard",
    value: "$7,523",
  },
  {
    id: 6,
    name: "Form Builder",
    category: "SaaS",
    country: "/images/country/country-06.svg",
    cr: "Dashboard",
    value: "$1,377",
  },
  {
    id: 7,
    name: "AyroUI",
    category: "UI Kit",
    country: "/images/country/country-07.svg",
    cr: "Dashboard",
    value: "$599,00",
  },
]

export default function BasicTableFive() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
      <div className="flex items-center justify-between px-5 py-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Recent Orders
        </h3>
        <div className="flex items-center gap-3">
          <button className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 dark:border-white/10 dark:text-gray-300">
            Filter
          </button>
          <button className="flex h-10 items-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 dark:border-white/10 dark:text-gray-300">
            See all
          </button>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[720px]">
          <Table>
            <TableHeader className="border-y border-gray-100 dark:border-white/5">
              <TableRow>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Products
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
                  Country
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  CR
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Value
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
              {tableData.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="px-5 py-4 font-medium text-gray-800 text-start text-theme-sm dark:text-white/90">
                    {product.name}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {product.category}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-start">
                    <div className="h-6 w-6 overflow-hidden rounded-full">
                      <Image
                        width={24}
                        height={24}
                        src={product.country}
                        alt={product.name}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-4 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    {product.cr}
                  </TableCell>
                  <TableCell className="px-5 py-4 font-medium text-green-600 text-start text-theme-sm dark:text-green-500">
                    {product.value}
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
