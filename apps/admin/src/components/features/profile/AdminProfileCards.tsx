import React from "react"

import type { GetAdminMeResponse } from "@repo/api-schema"

import UserAvatar from "@/components/ui/avatar/UserAvatar"
import { resolveAdminDisplayName } from "@/features/admin/admin-display-name"
import { formatDateTime } from "@/libs/date"

type Props = {
  admin: GetAdminMeResponse
}

/**
 * マイページのカード。見た目は TailAdmin のデモのプロフィール画面に合わせる（編集のボタンとモーダルは置かない）
 */
export default function AdminProfileCards({ admin }: Props) {
  const displayName = resolveAdminDisplayName(admin)
  const infoItems = [
    { label: "名前", value: admin.name || "-" },
    { label: "メールアドレス", value: admin.email },
    { label: "登録日時", value: formatDateTime(admin.created_at) },
    { label: "最終サインイン日時", value: admin.last_signed_in_at ? formatDateTime(admin.last_signed_in_at) : "-" },
  ]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6 dark:border-gray-800 dark:bg-white/3">
      <h3 className="mb-5 text-lg font-semibold text-gray-800 lg:mb-7 dark:text-white/90">マイページ</h3>

      <div className="mb-6 rounded-2xl border border-gray-200 p-5 lg:p-6 dark:border-gray-800">
        <div className="flex w-full flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="overflow-hidden rounded-full border border-gray-200 dark:border-gray-800">
            <UserAvatar avatarUrl={admin.avatar_url} name={displayName} size="lg" />
          </div>
          <div className="text-left">
            <h4 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">{displayName}</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">{admin.email}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 p-5 lg:p-6 dark:border-gray-800">
        <h4 className="mb-4 text-lg font-semibold text-gray-800 lg:mb-6 dark:text-white/90">基本情報</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-7 2xl:gap-x-32">
          {infoItems.map((item) => (
            <div key={item.label}>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">{item.label}</p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">{item.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
          名前とアイコンは Google アカウントのものを表示しています（サインインのたびに更新されます）
        </p>
      </div>
    </div>
  )
}
