import Link from "next/link"

import type { AdminUserSort, GetAdminUserListResponse } from "@repo/api-schema"

import Badge from "@/components/ui/badge/Badge"
import {
  PaginationLinks,
  SortableHeaderCell,
  tableCellClass,
  tableFrameClass,
  tableHeadCellClass,
  TableSearchForm,
  tableToolbarClass,
} from "@/components/ui/table/LinkTableParts"
import { formatAuthProvider, formatUserName, hasUserName } from "@/features/user/user.labels"
import { buildUserListHref, buildUserListSearchFormValues, type UserListQuery } from "@/features/user/user.params"
import { formatDate } from "@/libs/date"
import { EMPTY_VALUE, formatCount, formatRowRange } from "@/libs/format-stats"

import { LoginMethodColumnLabel } from "./LoginMethodColumnLabel"
import { UserAvatar } from "./UserAvatar"

/**
 * 表が空のときの見出しと補足（範囲外のページ・絞り込みで 0 件・ユーザーがまだいない）
 */
const buildEmptyMessage = (total: number, q: string | undefined): { description: string, title: string } => {
  if (total > 0) return { description: "Previous で最後のページに戻れます。", title: "このページにはユーザーがいません" }
  if (q) return { description: "名前かメールアドレスの一部で絞り込めます。", title: "条件に合うユーザーがいません" }
  return { description: "登録したユーザーがここに並びます。", title: "ユーザーがいません" }
}

/**
 * ユーザー一覧の表。並べ替え・絞り込み・ページ送りは URL のクエリを変えて API に任せる（admin-users の UI 設計）
 */
export function UserTable({ list, query }: { list: GetAdminUserListResponse, query: UserListQuery }) {
  const totalPages = Math.max(1, Math.ceil(list.total / list.limit))
  const emptyMessage = buildEmptyMessage(list.total, query.q)
  const renderSortableHeader = (sort: AdminUserSort, label: string) => (
    <SortableHeaderCell
      href={buildUserListHref({ ...query, order: query.sort === sort && query.order === "desc" ? "asc" : "desc", page: 1, sort })}
      isActive={query.sort === sort}
      label={label}
      order={query.order}
    />
  )

  return (
    <div className={tableFrameClass}>
      <div className={tableToolbarClass}>
        <span className="text-theme-sm text-gray-500 dark:text-gray-400">{formatCount(list.total)} 人</span>
        <TableSearchForm action="/users" hiddenValues={buildUserListSearchFormValues(query)} placeholder="名前・メールで絞り込む" query={query.q} />
      </div>
      <div className="custom-scrollbar overflow-x-auto">
        <table className="min-w-full">
          <thead className="border-b border-gray-100 dark:border-white/5">
            <tr>
              <th className={tableHeadCellClass}>ユーザー</th>
              <th className={tableHeadCellClass}>メールアドレス</th>
              <th className={tableHeadCellClass}><LoginMethodColumnLabel /></th>
              {renderSortableHeader("created_at", "登録日")}
              {renderSortableHeader("last_studied_date", "最後に学習した日")}
              {renderSortableHeader("solved_attempts", "解いた回数")}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/5">
            {list.users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                <td className="px-5 py-3 text-theme-sm">
                  <Link className="flex items-center gap-3" href={`/users/${user.id}`}>
                    <UserAvatar avatarUrl={user.avatar_url} name={user.name} size={36} />
                    <span>
                      <span className={`block font-medium whitespace-nowrap hover:text-brand-500 ${hasUserName(user.name) ? "text-gray-800 dark:text-white/90" : "text-gray-400"}`}>
                        {formatUserName(user.name)}
                      </span>
                      <span className="block text-theme-xs text-gray-400">ID {user.id}</span>
                    </span>
                  </Link>
                </td>
                <td className={tableCellClass}>{user.email ?? EMPTY_VALUE}</td>
                <td className={tableCellClass}>
                  <span className="flex gap-1">
                    {user.providers.map(provider => (
                      <Badge key={provider} color="light" size="sm">{formatAuthProvider(provider)}</Badge>
                    ))}
                  </span>
                </td>
                <td className={tableCellClass}>{formatDate(user.created_at)}</td>
                <td className={tableCellClass}>{user.last_studied_date ?? EMPTY_VALUE}</td>
                <td className={`${tableCellClass} font-medium text-gray-800 dark:text-white/90`}>{formatCount(user.solved_attempts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.users.length === 0 && (
        <div className="px-5 py-12 text-center">
          <p className="text-base font-medium text-gray-800 dark:text-white/90">{emptyMessage.title}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{emptyMessage.description}</p>
        </div>
      )}
      <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-100 px-5 py-4 xl:flex-row dark:border-white/5">
        <span className="text-theme-sm text-gray-500 dark:text-gray-400">
          {formatRowRange({ limit: list.limit, page: list.page, rowCount: list.users.length, total: list.total }, "人")}
        </span>
        <PaginationLinks buildHref={page => buildUserListHref({ ...query, page })} page={list.page} totalPages={totalPages} />
      </div>
    </div>
  )
}
