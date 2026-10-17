"use client"

import React from "react"

import AppHeader, { type AppHeaderProps } from "@/components/layout/AppHeader"
import AppSidebar from "@/components/layout/AppSidebar"
import Backdrop from "@/components/layout/Backdrop"
import { useSidebar } from "@/features/sidebar/sidebar.context"

type AdminShellProps = AppHeaderProps & {
  children: React.ReactNode
}

/**
 * サイドバー付きの画面の枠（client）。サイドバーの開閉で本文の左の余白を変える。
 * データ（admin・通知・検索）は layout（Server Component）から props で受け取り、ヘッダーに渡す
 */
export default function AdminShell({ children, ...headerProps }: AdminShellProps) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar()

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
      ? "lg:ml-[290px]"
      : "lg:ml-[90px]"

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <Backdrop />
      {/**
        * flex item は既定で中身の最小幅より縮まないため、min-w-0 で縮められるようにする（広い表がページを広げず、カードの中でスクロールする）
        */}
      <div className={`min-w-0 flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
        <AppHeader {...headerProps} />
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">{children}</div>
      </div>
    </div>
  )
}
