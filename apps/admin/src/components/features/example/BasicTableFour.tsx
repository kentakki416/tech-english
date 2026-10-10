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

interface Campaign {
  id: number;
  creator: {
    name: string;
    image: string;
  };
  campaign: {
    title: string;
    icon: string;
  };
  status: "Success" | "Pending" | "Failed";
}

const tableData: Campaign[] = [
  {
    id: 1,
    creator: { name: "Wilson Gouse", image: "/images/user/user-01.jpg" },
    campaign: { title: "Grow your brand by...", icon: "/images/brand/brand-03.svg" },
    status: "Success",
  },
  {
    id: 2,
    creator: { name: "Terry Franci", image: "/images/user/user-02.jpg" },
    campaign: { title: "Make Better Ideas...", icon: "/images/brand/brand-05.svg" },
    status: "Pending",
  },
  {
    id: 3,
    creator: { name: "Alena Franci", image: "/images/user/user-03.jpg" },
    campaign: { title: "Increase your website tra...", icon: "/images/brand/brand-06.svg" },
    status: "Success",
  },
  {
    id: 4,
    creator: { name: "Jocelyn Kenter", image: "/images/user/user-04.jpg" },
    campaign: { title: "Digital Marketing that...", icon: "/images/brand/brand-04.svg" },
    status: "Failed",
  },
  {
    id: 5,
    creator: { name: "Brandon Philips", image: "/images/user/user-05.jpg" },
    campaign: { title: "Self branding", icon: "/images/brand/brand-05.svg" },
    status: "Success",
  },
  {
    id: 6,
    creator: { name: "James Lipshutz", image: "/images/user/user-06.jpg" },
    campaign: { title: "Increase your website tra...", icon: "/images/brand/brand-06.svg" },
    status: "Success",
  },
]

const statusColor = (status: Campaign["status"]) => {
  if (status === "Success") return "success"
  if (status === "Pending") return "warning"
  return "error"
}

export default function BasicTableFour() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
      <div className="flex items-center justify-between px-5 py-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Featured Campaigns
        </h3>
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
                  Creator
                </TableCell>
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  Campaign
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
              {tableData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="px-5 py-4 text-start">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 overflow-hidden rounded-full">
                        <Image
                          width={40}
                          height={40}
                          src={row.creator.image}
                          alt={row.creator.name}
                        />
                      </div>
                      <span className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                        {row.creator.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-4 text-start">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 overflow-hidden rounded-full">
                        <Image
                          width={36}
                          height={36}
                          src={row.campaign.icon}
                          alt={row.campaign.title}
                        />
                      </div>
                      <div>
                        <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {row.campaign.title}
                        </span>
                        <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                          Ads campaign
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-4 text-start">
                    <Badge size="sm" color={statusColor(row.status)}>
                      {row.status}
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
