import type { Metadata } from "next"
import React from "react"

import AdminProfileCards from "@/components/features/profile/AdminProfileCards"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { adminApi } from "@/features/admin/admin.api"

export const metadata: Metadata = {
  title: "マイページ",
}

/**
 * マイページ。サインイン中の admin の情報を出す
 */
export default async function ProfilePage() {
  const admin = await adminApi.getMe()

  return (
    <div>
      <PageBreadcrumb pageTitle="マイページ" />
      <AdminProfileCards admin={admin} />
    </div>
  )
}
