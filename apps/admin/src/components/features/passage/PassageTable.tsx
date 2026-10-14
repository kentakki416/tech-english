"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import type { AdminPassageStatus, GetAdminPassageListResponse } from "@repo/api-schema"

import ComponentCard from "@/components/layout/ComponentCard"
import Badge from "@/components/ui/badge/Badge"
import { type Column, DataTable, type FilterConfig } from "@/components/ui/table"
import {
  PASSAGE_DIFFICULTY_LABELS,
  PASSAGE_STATUS_BADGE_COLORS,
  PASSAGE_STATUS_LABELS,
  PASSAGE_STATUS_ORDER,
} from "@/features/passage/passage.labels"
import { formatDateTime } from "@/libs/format-date"

type PassageListItem = GetAdminPassageListResponse["passages"][number]

/**
 * 表の 1 行。API のレスポンスに、検索・Filter・表示に使う値を足す
 */
type PassageRow = PassageListItem & {
  attentionLabel: "あり" | "なし"
  sourceName: string
  updatedAtLabel: string
}

/**
 * 状態ごとの列の見出し
 */
const NOTE_HEADERS: Record<AdminPassageStatus, string> = {
  collected: "メモ",
  draft: "要確認",
  failed: "エラー",
  generating: "メモ",
  published: "挑戦",
  rejected: "却下の理由",
}

const NOWRAP_CELL = "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400"

const EMPTY_MARK = <span className="text-gray-300 dark:text-gray-600">―</span>

/**
 * 状態ごとの列（下書き＝要確認の理由、公開＝挑戦の件数、却下＝却下の理由、失敗＝エラー、それ以外＝「―」）
 */
function PassageNote({ row }: { row: PassageRow }) {
  if (row.status === "published") return <span className="tabular-nums">{row.attempt_count} 件</span>
  if (row.status === "rejected") return row.reject_reason ? <p className="text-theme-xs">{row.reject_reason}</p> : EMPTY_MARK
  if (row.status === "failed") return row.generation_error ? <p className="text-theme-xs">{row.generation_error}</p> : EMPTY_MARK
  if (row.status !== "draft" || row.attention_reasons.length === 0) return EMPTY_MARK
  return (
    <div className="space-y-1">
      {row.attention_reasons.map((reason, index) => (
        <p key={index} className="flex items-start gap-1.5 text-theme-xs text-warning-600 dark:text-orange-400">
          <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-warning-500" />
          {reason}
        </p>
      ))}
    </div>
  )
}

const createColumns = (status: AdminPassageStatus): Column<PassageRow>[] => [
  {
    header: "タイトル",
    render: (row) => (
      <div>
        <Link className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90" href={`/passages/${row.id}`}>
          {row.title}
        </Link>
        <p className="mt-0.5 text-theme-xs text-gray-400">{row.sourceName}</p>
      </div>
    ),
  },
  {
    className: NOWRAP_CELL,
    header: "状態",
    render: (row) => <Badge color={PASSAGE_STATUS_BADGE_COLORS[row.status]} size="sm">{PASSAGE_STATUS_LABELS[row.status]}</Badge>,
  },
  { className: NOWRAP_CELL, header: "難易度", render: (row) => (row.difficulty ? PASSAGE_DIFFICULTY_LABELS[row.difficulty] : "―") },
  { className: `${NOWRAP_CELL} tabular-nums`, header: "英単語数", key: "word_count" },
  { className: `${NOWRAP_CELL} tabular-nums`, header: "設問", render: (row) => (row.question_count > 0 ? row.question_count : "―") },
  {
    className: "max-w-80 px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400",
    header: NOTE_HEADERS[status],
    render: (row) => <PassageNote row={row} />,
  },
  { className: NOWRAP_CELL, header: "更新日時", key: "updatedAtLabel" },
  {
    className: "px-5 py-4 text-right text-theme-sm whitespace-nowrap",
    header: "",
    render: (row) => (
      <Link className="font-medium text-brand-500 hover:text-brand-600" href={`/passages/${row.id}`}>
        {row.status === "draft" ? "確認する" : "表示"}
      </Link>
    ),
  },
]

/**
 * Filter：ソース（取得した行のソース名から作る）と、下書きのときだけ要確認
 */
const createFilters = (status: AdminPassageStatus, rows: PassageRow[]): FilterConfig<PassageRow>[] => {
  const sourceNames = [...new Set(rows.map((row) => row.sourceName))].sort((a, b) => a.localeCompare(b, "ja"))
  return [
    { key: "sourceName", label: "ソース", options: sourceNames.map((name) => ({ label: name, value: name })) },
    ...(status === "draft"
      ? [{ key: "attentionLabel" as const, label: "要確認", options: [{ label: "要確認あり", value: "あり" }, { label: "要確認なし", value: "なし" }] }]
      : []),
  ]
}

/**
 * API の 1 行を表の行にする
 */
const convertPassageToRow = (passage: PassageListItem): PassageRow => ({
  ...passage,
  attentionLabel: passage.needs_attention ? "あり" : "なし",
  sourceName: passage.source.name,
  updatedAtLabel: formatDateTime(passage.updated_at),
})

/**
 * 問題一覧の状態ごとの件数のカードと表。表は Basic Table と同じ DataTable を使い、並びは API の順のまま
 * （下書きは要確認 → 更新が古い順、それ以外は更新が新しい順）
 */
export function PassageTable({
  isTruncated,
  passages,
  status,
  statusCounts,
}: {
  isTruncated: boolean
  passages: PassageListItem[]
  status: AdminPassageStatus
  statusCounts: GetAdminPassageListResponse["status_counts"]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const rows = passages.map(convertPassageToRow)
  const orderDescription = status === "draft" ? "要確認の印が付いたものを先頭に、古い順に並べています。" : "新しい順に並べています。"

  const selectStatus = (next: AdminPassageStatus) => {
    if (next === status) return
    startTransition(() => router.push(`/passages?status=${next}`))
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {PASSAGE_STATUS_ORDER.map((item) => (
          <button
            key={item}
            aria-pressed={status === item}
            className={`rounded-2xl border px-5 py-4 text-left transition-colors ${
              status === item
                ? "border-brand-500 bg-white ring-1 ring-brand-500 dark:bg-white/3"
                : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-white/3 dark:hover:border-gray-700"
            }`}
            onClick={() => selectStatus(item)}
            type="button"
          >
            <span className="text-theme-sm text-gray-500 dark:text-gray-400">{PASSAGE_STATUS_LABELS[item]}</span>
            <span className="mt-1 block text-title-sm font-bold text-gray-800 tabular-nums dark:text-white/90">{statusCounts[item]}</span>
          </button>
        ))}
      </div>

      <div aria-busy={isPending} className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <ComponentCard
          desc={isTruncated ? `${orderDescription}先頭の 1000 件を表示しています。` : orderDescription}
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
            filters={createFilters(status, rows)}
            getRowKey={(row) => row.id}
            pagination={{ pageSizeOptions: [10, 20, 50] }}
            search={{ filterKeys: ["title", "sourceName"], placeholder: "タイトル・ソース名" }}
          />
        </ComponentCard>
      </div>
    </div>
  )
}
