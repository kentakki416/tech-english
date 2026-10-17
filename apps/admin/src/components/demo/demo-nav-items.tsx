import React from "react"

import type { NavSection } from "@/components/layout/nav-items"
import {
  BoxCubeIcon,
  CalenderIcon,
  GridIcon,
  ListIcon,
  PageIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  UserCircleIcon,
} from "@/icons"

export const demoNavSection: NavSection = {
  items: [
    { icon: <GridIcon />, name: "Dashboard", subItems: [{ name: "Ecommerce", path: "/demo/ecommerce" }] },
    { icon: <CalenderIcon />, name: "Calendar", path: "/demo/calendar" },
    { icon: <UserCircleIcon />, name: "User Profile", path: "/demo/profile" },
    { icon: <ListIcon />, name: "Forms", subItems: [{ name: "Form Elements", path: "/demo/forms/elements" }] },
    { icon: <TableIcon />, name: "Tables", subItems: [{ name: "Basic Tables", path: "/demo/tables/basic" }] },
    { icon: <PageIcon />, name: "Pages", subItems: [{ name: "Blank Page", path: "/demo/blank" }] },
    {
      icon: <PieChartIcon />,
      name: "Charts",
      subItems: [
        { name: "Line Chart", path: "/demo/charts/line" },
        { name: "Bar Chart", path: "/demo/charts/bar" },
        { name: "Pie Chart", path: "/demo/charts/pie" },
        { name: "Radar Chart", path: "/demo/charts/radar" },
      ],
    },
    {
      icon: <BoxCubeIcon />,
      name: "UI Elements",
      subItems: [
        { name: "Alerts", path: "/demo/ui/alerts" },
        { name: "Avatar", path: "/demo/ui/avatars" },
        { name: "Badge", path: "/demo/ui/badge" },
        { name: "Buttons", path: "/demo/ui/buttons" },
        { name: "Images", path: "/demo/ui/images" },
        { name: "Tooltips", path: "/demo/ui/tooltips" },
        { name: "Videos", path: "/demo/ui/videos" },
      ],
    },
    {
      icon: <PlugInIcon />,
      name: "Authentication",
      subItems: [
        { name: "Sign In", path: "/signin" },
        { name: "Sign Up", path: "/demo/signup" },
      ],
    },
  ],
  title: "デモ",
}
