import { unstable_rethrow } from "next/navigation"
import React from "react"

import AdminShell from "@/components/layout/AdminShell"
import { adminApi } from "@/features/admin/admin.api"
import { markAllAsReadAction } from "@/features/notification/notification.actions"
import { notificationApi } from "@/features/notification/notification.api"

/**
 * サイドバー付きの画面の枠。サインイン中の admin と通知を取ってシェルに渡す。
 *
 * proxy は cookie の期限しか見ないので、ここで api の /api/admin/me を呼び、画面を直接開いたとき・再読み込みのとき
 * （router.refresh を含む）は api が token を確かめる。クライアント側の遷移では layout は描き直されないので、
 * 機密を出す画面は自分で api を呼ぶ
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [admin, notifications] = await Promise.all([
    adminApi.getMe(),
    /**
     * 通知が取れなくても画面は出す（通知の api だけの障害で、全画面をエラーにしない）
     */
    notificationApi.getList().catch((error: unknown) => {
      unstable_rethrow(error)
      console.error("通知を取得できませんでした", error)
      return []
    }),
  ])

  return (
    <AdminShell
      admin={admin}
      markAllAsReadAction={markAllAsReadAction}
      notifications={notifications}
    >
      {children}
    </AdminShell>
  )
}
