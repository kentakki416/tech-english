import type { GetAdminUserResponse } from "@repo/api-schema"

import Badge from "@/components/ui/badge/Badge"
import { formatAuthProvider } from "@/features/user/user.labels"
import { formatDateTime } from "@/libs/format-date"
import { EMPTY_VALUE } from "@/libs/format-stats"

import { UserAvatar } from "./UserAvatar"

/**
 * ユーザーの基本の情報（アイコン・名前・メールアドレス・ログイン方法、ユーザー ID・登録日時・タイムゾーン・最後に学習した日）
 */
export function UserProfileCard({ user }: { user: GetAdminUserResponse["user"] }) {
  const items = [
    { label: "ユーザー ID", value: String(user.id) },
    { label: "登録日時", value: `${formatDateTime(user.created_at)}（日本時間）` },
    { label: "タイムゾーン", value: user.timezone },
    { label: "最後に学習した日", value: user.last_studied_date ?? EMPTY_VALUE },
  ]
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6 dark:border-gray-800 dark:bg-white/3">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <UserAvatar avatarUrl={user.avatar_url} name={user.name} size={72} />
        <div className="min-w-0">
          <h2 className={`text-lg font-semibold ${user.name ? "text-gray-800 dark:text-white/90" : "text-gray-400"}`}>{user.name ?? "（名前なし）"}</h2>
          <p className="mt-1 text-sm break-all text-gray-500 dark:text-gray-400">{user.email ?? "メールアドレスなし"}</p>
          <div className="mt-2 flex gap-1">
            {user.providers.map(provider => <Badge key={provider} color="light" size="sm">{formatAuthProvider(provider)}</Badge>)}
          </div>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-gray-100 pt-5 sm:grid-cols-2 xl:grid-cols-4 dark:border-gray-800">
        {items.map(item => (
          <div key={item.label}>
            <dt className="text-theme-xs text-gray-500 dark:text-gray-400">{item.label}</dt>
            <dd className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
