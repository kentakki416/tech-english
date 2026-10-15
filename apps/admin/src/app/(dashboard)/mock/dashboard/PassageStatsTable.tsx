"use client"

import Link from "next/link"
import { useState } from "react"

import Badge from "@/components/ui/badge/Badge"
import Pagination from "@/components/ui/table/Pagination"
import { type AdminStatsPeriod, DIFFICULTY_LABELS, PASSAGE_STATUS_LABELS, type PassageStatsRow } from "@/libs/mock-data"

import { EMPTY_VALUE, formatCount, formatElapsedWithLimit, formatRate } from "../_components/stats-format"
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

type SortKey = "averageElapsedSeconds" | "correctRate" | "overtimeRate" | "publishedAt" | "solvedAttempts" | "solvedUsers"

/**
 * 1 ページの件数（本実装と同じ）
 */
const PAGE_SIZE = 50

/**
 * 正答率がこれより低い問題は橙で示す（難しすぎる問題を見つけやすくする）
 */
const LOW_CORRECT_RATE = 0.5

/**
 * 問題ごとの成績の表（モック）。本実装では並べ替え・絞り込み・ページ送りを URL のクエリにして API に任せる
 */
export function PassageStatsTable({ period, rows }: { period: AdminStatsPeriod, rows: PassageStatsRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey, order: SortOrder }>({ key: "solvedUsers", order: "desc" })
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const filtered = sortRowsWithNullsLast(
    rows.filter(row => row.title.toLowerCase().includes(query.trim().toLowerCase())),
    sort.key,
    sort.order,
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const changeSort = (key: SortKey) => {
    setSort(previous => ({ key, order: previous.key === key && previous.order === "desc" ? "asc" : "desc" }))
    setPage(1)
  }
  const renderSortableHeader = (key: SortKey, label: string) => (
    <SortableHeaderCell isActive={sort.key === key} label={label} order={sort.order} onClick={() => changeSort(key)} />
  )

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">問題ごとの成績</h3>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">公開中の問題と、期間内に解かれた問題。タイトルを押すと設問ごとの分析を開きます。</p>
      </div>
      <div className={tableFrameClass}>
        <div className={tableToolbarClass}>
          <span className="text-theme-sm text-gray-500 dark:text-gray-400">{formatCount(filtered.length)} 件</span>
          <SearchField
            placeholder="タイトルで絞り込む"
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
                <th className={tableHeadCellClass}>タイトル</th>
                <th className={tableHeadCellClass}>状態</th>
                <th className={tableHeadCellClass}>難易度</th>
                {renderSortableHeader("solvedUsers", "解いた人数")}
                {renderSortableHeader("solvedAttempts", "解いた回数")}
                {renderSortableHeader("correctRate", "正答率")}
                {renderSortableHeader("averageElapsedSeconds", "平均時間 / 制限")}
                {renderSortableHeader("overtimeRate", "時間超過")}
                <th className={tableHeadCellClass}>アシスト（和訳 / 単語 / 読み上げ）</th>
                {renderSortableHeader("publishedAt", "公開日")}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {pageRows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                  <td className="min-w-64 px-5 py-4 text-theme-sm">
                    <Link className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90" href={`/mock/analytics/passages/${row.id}?period=${period}`}>
                      {row.title}
                    </Link>
                    <p className="mt-0.5 text-theme-xs text-gray-400">{row.sourceName}</p>
                  </td>
                  <td className={tableCellClass}>
                    <Badge color={row.status === "published" ? "success" : "light"} size="sm">
                      {row.status === "published" ? PASSAGE_STATUS_LABELS.published : "非公開"}
                    </Badge>
                  </td>
                  <td className={tableCellClass}>{DIFFICULTY_LABELS[row.difficulty]}</td>
                  <td className={`${tableCellClass} font-medium text-gray-800 dark:text-white/90`}>{formatCount(row.solvedUsers)}</td>
                  <td className={tableCellClass}>{formatCount(row.solvedAttempts)}</td>
                  <td className={`${tableCellClass} ${row.correctRate !== null && row.correctRate < LOW_CORRECT_RATE ? "font-medium text-warning-600 dark:text-orange-400" : ""}`}>
                    {formatRate(row.correctRate)}
                  </td>
                  <td className={tableCellClass}>{formatElapsedWithLimit(row.averageElapsedSeconds, row.timeLimitSeconds)}</td>
                  <td className={tableCellClass}>{formatRate(row.overtimeRate)}</td>
                  <td className={tableCellClass}>
                    {formatRate(row.assistRates.translated)} / {formatRate(row.assistRates.lookedUp)} / {formatRate(row.assistRates.listened)}
                  </td>
                  <td className={tableCellClass}>{row.publishedAt ?? EMPTY_VALUE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-base font-medium text-gray-800 dark:text-white/90">条件に合う問題がありません</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">絞り込みの文字を変えてください。</p>
          </div>
        )}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-100 px-5 py-4 xl:flex-row dark:border-white/5">
          <span className="text-theme-sm text-gray-500 dark:text-gray-400">
            {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}〜{Math.min(page * PAGE_SIZE, filtered.length)} 件目 / {formatCount(filtered.length)} 件
          </span>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>
    </div>
  )
}
