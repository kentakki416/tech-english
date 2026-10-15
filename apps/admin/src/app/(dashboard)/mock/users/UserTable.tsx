"use client"

import Link from "next/link"
import { useState } from "react"

import Badge from "@/components/ui/badge/Badge"
import Pagination from "@/components/ui/table/Pagination"
import { AUTH_PROVIDER_LABELS, type MockUser } from "@/libs/mock-data"

import { EMPTY_VALUE, formatCount } from "../_components/stats-format"
import {
  SearchField,
  SortableHeaderCell,
  type SortOrder,
  sortRowsWithNullsLast,
  tableCellClass,
  tableFrameClass,
  tableHeadCellClass,
  tableToolbarClass,
} from "../_components/TableParts"

import { UserAvatar } from "./UserAvatar"

type SortKey = "createdAt" | "lastStudiedDate" | "solvedAttempts"

/**
 * 1 ページの件数（本実装と同じ）
 */
const PAGE_SIZE = 50

/**
 * ユーザー一覧の表（モック）。本実装では並べ替え・絞り込み・ページ送りを URL のクエリにして API に任せる
 */
export function UserTable({ initialQuery, users }: { initialQuery: string, users: MockUser[] }) {
  const [sort, setSort] = useState<{ key: SortKey, order: SortOrder }>({ key: "createdAt", order: "desc" })
  const [query, setQuery] = useState(initialQuery)
  const [page, setPage] = useState(1)

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = sortRowsWithNullsLast(
    users.filter(user => normalizedQuery === "" || [user.name, user.email].some(value => value?.toLowerCase().includes(normalizedQuery))),
    sort.key,
    sort.order,
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageUsers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const changeSort = (key: SortKey) => {
    setSort(previous => ({ key, order: previous.key === key && previous.order === "desc" ? "asc" : "desc" }))
    setPage(1)
  }
  const renderSortableHeader = (key: SortKey, label: string) => (
    <SortableHeaderCell isActive={sort.key === key} label={label} order={sort.order} onClick={() => changeSort(key)} />
  )

  return (
    <div className={tableFrameClass}>
      <div className={tableToolbarClass}>
        <span className="text-theme-sm text-gray-500 dark:text-gray-400">{formatCount(filtered.length)} 人</span>
        <SearchField
          placeholder="名前・メールで絞り込む"
          value={query}
          onChange={(value) => {
            setQuery(value)
            setPage(1)
          }}
        />
      </div>
      <div className="custom-scrollbar overflow-x-auto">
        <table className="min-w-full">
          <thead className="border-b border-gray-100 dark:border-white/5">
            <tr>
              <th className={tableHeadCellClass}>ユーザー</th>
              <th className={tableHeadCellClass}>メールアドレス</th>
              <th className={tableHeadCellClass}>ログイン方法</th>
              {renderSortableHeader("createdAt", "登録日")}
              {renderSortableHeader("lastStudiedDate", "最後に学習した日")}
              {renderSortableHeader("solvedAttempts", "解いた回数")}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/5">
            {pageUsers.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                <td className="px-5 py-3 text-theme-sm">
                  <Link className="flex items-center gap-3" href={`/mock/users/${user.id}`}>
                    <UserAvatar avatarUrl={user.avatarUrl} name={user.name} size={36} />
                    <span>
                      <span className={`block font-medium whitespace-nowrap hover:text-brand-500 ${user.name ? "text-gray-800 dark:text-white/90" : "text-gray-400"}`}>
                        {user.name ?? "（名前なし）"}
                      </span>
                      <span className="block text-theme-xs text-gray-400">ID {user.id}</span>
                    </span>
                  </Link>
                </td>
                <td className={tableCellClass}>{user.email ?? EMPTY_VALUE}</td>
                <td className={tableCellClass}>
                  <span className="flex gap-1">
                    {user.providers.map(provider => (
                      <Badge key={provider} color="light" size="sm">{AUTH_PROVIDER_LABELS[provider] ?? provider}</Badge>
                    ))}
                  </span>
                </td>
                <td className={tableCellClass}>{user.createdAt.slice(0, 10)}</td>
                <td className={tableCellClass}>{user.lastStudiedDate ?? EMPTY_VALUE}</td>
                <td className={`${tableCellClass} font-medium text-gray-800 dark:text-white/90`}>{formatCount(user.solvedAttempts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageUsers.length === 0 && (
        <div className="px-5 py-12 text-center">
          <p className="text-base font-medium text-gray-800 dark:text-white/90">条件に合うユーザーがいません</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">名前かメールアドレスの一部で絞り込めます。</p>
        </div>
      )}
      <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-100 px-5 py-4 xl:flex-row dark:border-white/5">
        <span className="text-theme-sm text-gray-500 dark:text-gray-400">
          {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}〜{Math.min(page * PAGE_SIZE, filtered.length)} 人目 / {formatCount(filtered.length)} 人
        </span>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  )
}
