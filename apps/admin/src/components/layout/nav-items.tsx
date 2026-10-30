import React from "react"

import { DocsIcon, FolderIcon, GridIcon, ListIcon, UserCircleIcon } from "@/icons"

/**
 * path か subItems のどちらかを持つ
 */
export type NavItem = {
  icon: React.ReactNode
  name: string
  path?: string
  subItems?: { name: string, path: string }[]
}

export type NavSection = {
  items: NavItem[]
  title: string
}

export const mainNavSection: NavSection = {
  items: [
    { icon: <GridIcon />, name: "ダッシュボード", path: "/" },
    { icon: <DocsIcon />, name: "問題", path: "/passages" },
    { icon: <FolderIcon />, name: "ソース", path: "/sources" },
    { icon: <ListIcon />, name: "タグ", path: "/tags" },
    { icon: <UserCircleIcon />, name: "ユーザー", path: "/users" },
  ],
  title: "メニュー",
}
