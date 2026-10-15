"use client"

import Link from "next/link"

import type { GetContentSourceListResponse } from "@repo/api-schema"

import { TagChip } from "@/components/features/tag/TagChip"
import Badge from "@/components/ui/badge/Badge"
import { type Column, DataTable, type FilterConfig } from "@/components/ui/table"
import { formatDateTime } from "@/libs/format-date"

type ContentSourceListItem = GetContentSourceListResponse["sources"][number]

/**
 * 表の 1 行。API のレスポンスに、検索・Filter・表示に使う値を足す
 */
type SourceRow = ContentSourceListItem & {
  fetchTypeLabel: string
  lastCollectedLabel: string | null
  origin: string
  statusLabel: string
}

const COUNT_LABELS = [
  { key: "collected", label: "収集済み" },
  { key: "draft", label: "下書き" },
  { key: "published", label: "公開" },
  { key: "rejected", label: "却下" },
] as const

const COLUMNS: Column<SourceRow>[] = [
  {
    header: "ソース",
    render: (row) => (
      <div>
        <Link className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90" href={`/content-sources/${row.id}`}>
          {row.name}
        </Link>
        <p className="mt-0.5 font-mono text-theme-xs text-gray-400">{row.origin}</p>
      </div>
    ),
  },
  {
    header: "タグ",
    render: (row) =>
      row.tags.length > 0 ? (
        <div className="flex max-w-60 flex-wrap gap-1.5">
          {row.tags.map((tag) => <TagChip key={tag.id} color={tag.color} name={tag.name} />)}
        </div>
      ) : (
        <span className="text-gray-300 dark:text-gray-600">―</span>
      ),
  },
  {
    header: "取得方法",
    render: (row) => (
      <div className="whitespace-nowrap">
        <Badge color={row.fetch_type === "website" ? "info" : "dark"} size="sm">{row.fetchTypeLabel}</Badge>
        <p className="mt-1 text-theme-xs text-gray-400">{row.kind === "docs" ? "公式ドキュメント" : "GitHub の文書"}</p>
      </div>
    ),
  },
  { className: "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400", header: "ライセンス", key: "license_spdx" },
  {
    className: "px-5 py-4 text-theme-sm whitespace-nowrap",
    header: "状態",
    render: (row) => <Badge color={row.is_enabled ? "success" : "light"} size="sm">{row.statusLabel}</Badge>,
  },
  {
    className: "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400",
    header: "最終収集",
    render: (row) => row.lastCollectedLabel ?? <span className="text-gray-400">未収集</span>,
  },
  {
    header: "本文候補",
    render: (row) => (
      <div className="flex gap-3 whitespace-nowrap">
        {COUNT_LABELS.map((item) => (
          <span key={item.key} className="text-theme-xs">
            <span className="text-gray-400">{item.label}</span>
            <span className="ml-1 font-medium text-gray-800 tabular-nums dark:text-white/90">{row.passage_counts[item.key]}</span>
          </span>
        ))}
      </div>
    ),
  },
  {
    className: "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400",
    header: "取得失敗",
    render: (row) =>
      row.fetch_type === "website" ? (
        <span className={row.failed_page_count > 0 ? "font-medium text-error-600 dark:text-error-500" : ""}>
          {row.failed_page_count} ページ
        </span>
      ) : (
        <span className="text-gray-300 dark:text-gray-600">―</span>
      ),
  },
  {
    className: "px-5 py-4 text-right text-theme-sm whitespace-nowrap",
    header: "",
    render: (row) => (
      <Link className="font-medium text-brand-500 hover:text-brand-600" href={`/content-sources/${row.id}`}>
        編集
      </Link>
    ),
  },
]

const FILTERS: FilterConfig<SourceRow>[] = [
  { key: "fetchTypeLabel", label: "取得方法", options: [{ label: "GitHub", value: "GitHub" }, { label: "サイト", value: "サイト" }] },
  { key: "statusLabel", label: "状態", options: [{ label: "有効", value: "有効" }, { label: "無効", value: "無効" }] },
]

/**
 * API の 1 ソースを表の行にする。取得元は取得方法でないほうが null なので、ある方を使う
 */
const convertSourceToRow = (source: ContentSourceListItem): SourceRow => ({
  ...source,
  fetchTypeLabel: source.fetch_type === "website" ? "サイト" : "GitHub",
  lastCollectedLabel: source.last_collected_at ? formatDateTime(source.last_collected_at) : null,
  origin: source.repository ?? source.site_url ?? "",
  statusLabel: source.is_enabled ? "有効" : "無効",
})

/**
 * ソース一覧の表。Basic Tables と同じ DataTable（検索・Filter つき、ページ送りなし）
 */
export function SourceTable({ sources }: { sources: ContentSourceListItem[] }) {
  const rows = sources.map(convertSourceToRow)

  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      emptyMessage={
        <div>
          <p className="text-base font-medium text-gray-800 dark:text-white/90">まだソースがありません</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            GitHub リポジトリか公式ドキュメントのサイトを登録すると、翌日の収集から本文候補が作られます。
          </p>
        </div>
      }
      filters={FILTERS}
      getRowKey={(row) => row.id}
      search={{ filterKeys: ["name", "origin"], placeholder: "ソース名・リポジトリ・URL" }}
    />
  )
}
