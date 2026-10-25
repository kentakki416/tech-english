"use client"

import Link from "next/link"

import Badge from "@/components/ui/badge/Badge"
import { type Column, DataTable, type FilterConfig } from "@/components/ui/table"
import type { AdminSource } from "@/libs/mock-data"

type SourceRow = AdminSource & {
  fetchTypeLabel: string
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
    render: row => (
      <div>
        <Link className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90" href={`/mock/sources/${row.id}`}>
          {row.name}
        </Link>
        <p className="mt-0.5 font-mono text-theme-xs text-gray-400">{row.origin}</p>
      </div>
    ),
  },
  {
    header: "取得方法",
    render: row => (
      <div className="whitespace-nowrap">
        <Badge color={row.fetchType === "website" ? "info" : "dark"} size="sm">{row.fetchTypeLabel}</Badge>
        <p className="mt-1 text-theme-xs text-gray-400">{row.kind === "docs" ? "公式ドキュメント" : "GitHub の文書"}</p>
      </div>
    ),
  },
  { className: "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400", header: "ライセンス", key: "licenseSpdx" },
  {
    className: "px-5 py-4 text-theme-sm whitespace-nowrap",
    header: "状態",
    render: row => <Badge color={row.isEnabled ? "success" : "light"} size="sm">{row.statusLabel}</Badge>,
  },
  {
    className: "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400",
    header: "最終収集",
    render: row => {
      if (row.fetchType === "website") return <span className="text-gray-300 dark:text-gray-600">―</span>
      return row.lastCollectedAt ?? <span className="text-gray-400">未収集</span>
    },
  },
  {
    header: "本文候補",
    render: row => (
      <div className="flex gap-3 whitespace-nowrap">
        {COUNT_LABELS.map(item => (
          <span key={item.key} className="text-theme-xs">
            <span className="text-gray-400">{item.label}</span>
            <span className="ml-1 font-medium text-gray-800 tabular-nums dark:text-white/90">{row.passageCounts[item.key]}</span>
          </span>
        ))}
      </div>
    ),
  },
  {
    className: "px-5 py-4 text-right text-theme-sm whitespace-nowrap",
    header: "",
    render: row => (
      <Link className="font-medium text-brand-500 hover:text-brand-600" href={`/mock/sources/${row.id}`}>
        編集
      </Link>
    ),
  },
]

const FILTERS: FilterConfig<SourceRow>[] = [
  { key: "fetchTypeLabel", label: "取得方法", options: [{ label: "GitHub", value: "GitHub" }, { label: "サイト", value: "サイト" }] },
  {
    key: "statusLabel",
    label: "状態",
    options: [{ label: "有効", value: "有効" }, { label: "無効", value: "無効" }, { label: "収集しない", value: "収集しない" }],
  },
]

const buildStatusLabel = (source: AdminSource): string => {
  if (source.fetchType === "website") return "収集しない"
  return source.isEnabled ? "有効" : "無効"
}

/**
 * ソース一覧の表（モック）。Basic Table と同じ DataTable を使う
 */
export function SourceTable({ sources }: { sources: AdminSource[] }) {
  const rows: SourceRow[] = sources.map(source => ({
    ...source,
    fetchTypeLabel: source.fetchType === "website" ? "サイト" : "GitHub",
    statusLabel: buildStatusLabel(source),
  }))

  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      emptyMessage={
        <div>
          <p className="text-base font-medium text-gray-800 dark:text-white/90">まだソースがありません</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            GitHub のリポジトリを登録し、編集画面の「今すぐ収集」で本文候補を作ります。
          </p>
        </div>
      }
      filters={FILTERS}
      getRowKey={row => row.id}
      search={{ filterKeys: ["name", "origin"], placeholder: "ソース名・リポジトリ・URL" }}
    />
  )
}
