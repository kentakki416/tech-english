"use client"

import Link from "next/link"
import { useState } from "react"

import ComponentCard from "@/components/layout/ComponentCard"
import Badge from "@/components/ui/badge/Badge"
import { type Column, DataTable, type FilterConfig } from "@/components/ui/table"
import {
  type AdminPassageRow,
  type AdminPassageStatus,
  DIFFICULTY_LABELS,
  MOCK_PASSAGE_ROWS,
  MOCK_PASSAGE_STATUS_COUNTS,
  MOCK_SOURCES,
  PASSAGE_STATUS_LABELS,
} from "@/libs/mock-data"

type PassageTableRow = AdminPassageRow & {
  attentionLabel: string
}

const STATUS_ORDER: AdminPassageStatus[] = ["draft", "published", "collected", "generating", "rejected", "failed"]

const STATUS_BADGE_COLOR: Record<AdminPassageStatus, "dark" | "error" | "info" | "light" | "primary" | "success" | "warning"> = {
  collected: "light",
  draft: "primary",
  failed: "error",
  generating: "info",
  published: "success",
  rejected: "dark",
}

const NOTE_HEADER: Record<AdminPassageStatus, string> = {
  collected: "メモ",
  draft: "要確認",
  failed: "エラー",
  generating: "メモ",
  published: "挑戦",
  rejected: "却下の理由",
}

const NOWRAP_CELL = "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400"

const createColumns = (status: AdminPassageStatus): Column<PassageTableRow>[] => [
  {
    header: "タイトル",
    render: row => (
      <div>
        <Link className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90" href={`/mock/passages/${row.id}`}>
          {row.title}
        </Link>
        <p className="mt-0.5 text-theme-xs text-gray-400">{row.sourceName}</p>
      </div>
    ),
  },
  {
    className: NOWRAP_CELL,
    header: "状態",
    render: row => <Badge color={STATUS_BADGE_COLOR[row.status]} size="sm">{PASSAGE_STATUS_LABELS[row.status]}</Badge>,
  },
  { className: NOWRAP_CELL, header: "難易度", render: row => (row.difficulty ? DIFFICULTY_LABELS[row.difficulty] : "―") },
  { className: `${NOWRAP_CELL} tabular-nums`, header: "英単語数", key: "wordCount" },
  { className: `${NOWRAP_CELL} tabular-nums`, header: "設問", render: row => row.questionCount ?? "―" },
  {
    className: "max-w-80 px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400",
    header: NOTE_HEADER[status],
    render: (row) => {
      if (row.status === "published") return <span className="tabular-nums">{row.attemptCount} 件</span>
      if (row.note.length === 0) return <span className="text-gray-300 dark:text-gray-600">―</span>
      if (row.status !== "draft") return <p className="text-theme-xs">{row.note[0]}</p>
      return (
        <div className="space-y-1">
          {row.note.map(reason => (
            <p key={reason} className="flex items-start gap-1.5 text-theme-xs text-warning-600 dark:text-orange-400">
              <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-warning-500" />
              {reason}
            </p>
          ))}
        </div>
      )
    },
  },
  { className: NOWRAP_CELL, header: "更新日時", key: "updatedAt" },
  {
    className: "px-5 py-4 text-right text-theme-sm whitespace-nowrap",
    header: "",
    render: row => (
      <Link className="font-medium text-brand-500 hover:text-brand-600" href={`/mock/passages/${row.id}`}>
        {row.status === "draft" ? "確認する" : "表示"}
      </Link>
    ),
  },
]

const createFilters = (status: AdminPassageStatus): FilterConfig<PassageTableRow>[] => [
  { key: "sourceName", label: "ソース", options: MOCK_SOURCES.map(source => ({ label: source.name, value: source.name })) },
  ...(status === "draft"
    ? [{ key: "attentionLabel" as const, label: "要確認", options: [{ label: "要確認あり", value: "あり" }, { label: "要確認なし", value: "なし" }] }]
    : []),
]

/**
 * 問題一覧の状態タブと表（モック）。表は Basic Table と同じ DataTable を使う
 */
export function PassageTable({ initialStatus, isEmpty }: { initialStatus: AdminPassageStatus, isEmpty: boolean }) {
  const [status, setStatus] = useState<AdminPassageStatus>(initialStatus)

  /**
   * 下書きは要確認 → 古い順、それ以外は新しい順
   */
  const rows: PassageTableRow[] = isEmpty
    ? []
    : MOCK_PASSAGE_ROWS
      .filter(row => row.status === status)
      .map(row => ({ ...row, attentionLabel: row.note.length > 0 ? "あり" : "なし" }))
      .sort((a, b) =>
        status === "draft"
          ? Number(b.note.length > 0) - Number(a.note.length > 0) || a.updatedAt.localeCompare(b.updatedAt)
          : b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {STATUS_ORDER.map(item => (
          <button
            key={item}
            aria-pressed={status === item}
            className={`rounded-2xl border px-5 py-4 text-left transition-colors ${
              status === item
                ? "border-brand-500 bg-white ring-1 ring-brand-500 dark:bg-white/3"
                : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-white/3 dark:hover:border-gray-700"
            }`}
            onClick={() => setStatus(item)}
            type="button"
          >
            <span className="text-theme-sm text-gray-500 dark:text-gray-400">{PASSAGE_STATUS_LABELS[item]}</span>
            <span className="mt-1 block text-title-sm font-bold text-gray-800 tabular-nums dark:text-white/90">{MOCK_PASSAGE_STATUS_COUNTS[item]}</span>
          </button>
        ))}
      </div>

      <ComponentCard
        desc={status === "draft" ? "要確認の印が付いたものを先頭に、古い順に並べています。" : "新しい順に並べています。"}
        title={PASSAGE_STATUS_LABELS[status]}
      >
        <DataTable
          key={status}
          columns={createColumns(status)}
          data={rows}
          emptyMessage={
            <div>
              <p className="text-base font-medium text-gray-800 dark:text-white/90">条件に合う問題がありません</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">検索や Filter の条件を変えるか、別の状態のタブを選んでください。</p>
            </div>
          }
          filters={createFilters(status)}
          getRowKey={row => row.id}
          pagination={{ pageSizeOptions: [10, 20, 50] }}
          search={{ filterKeys: ["title", "sourceName"], placeholder: "タイトル・ソース名" }}
        />
      </ComponentCard>
    </div>
  )
}
