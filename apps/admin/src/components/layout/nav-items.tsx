import React from "react"

import { DocsIcon, FolderIcon, GridIcon, ListIcon, PlusIcon, UserCircleIcon } from "@/icons"
import { isLocalEnvironment } from "@/libs/environment"

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

const urlImportNavItem: NavItem = { icon: <PlusIcon />, name: "URL から追加", path: "/url-import" }

export const mainNavSection: NavSection = {
  items: [
    { icon: <GridIcon />, name: "ダッシュボード", path: "/" },
    { icon: <DocsIcon />, name: "問題", path: "/passages" },
    ...(isLocalEnvironment ? [urlImportNavItem] : []),
    { icon: <FolderIcon />, name: "ソース", path: "/sources" },
    { icon: <ListIcon />, name: "タグ", path: "/tags" },
    { icon: <UserCircleIcon />, name: "ユーザー", path: "/users" },
  ],
  title: "メニュー",
}
