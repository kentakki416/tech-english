import Link from "next/link"

import type { AdminPassageStatsSort, GetAdminPassageStatsListResponse } from "@repo/api-schema"

import {
  PaginationLinks,
  SortableHeaderCell,
  tableCellClass,
  tableFrameClass,
  tableHeadCellClass,
  TableSearchForm,
  tableToolbarClass,
} from "@/components/ui/table/LinkTableParts"
import { PASSAGE_DIFFICULTY_LABELS } from "@/features/passage/passage.labels"
import { PASSAGE_STATS_LABELS } from "@/features/stats/stats.labels"
import { buildDashboardHref, buildDashboardSearchFormValues, buildPassageAnalyticsHref, type DashboardQuery } from "@/features/stats/stats.params"
import { formatDate } from "@/libs/date"
import { convertRateToPercent, EMPTY_VALUE, formatAssistRates, formatCount, formatElapsedWithLimit, formatRate, formatRowRange } from "@/libs/format-stats"

import { PassageStatsStatusBadge } from "./PassageStatsStatusBadge"

/**
 * 正答率（表示の整数の %）がこれより低い問題は橙で示す（難しすぎる問題を見つけやすくする。UI 設計）
 */
const LOW_CORRECT_RATE_PERCENT = 50

/**
 * 正答率が低いか。表示と同じく丸めた % で比べる（49.5% は「50%」と出るので橙にしない）
 */
const isLowCorrectRate = (rate: number | null): boolean => rate !== null && convertRateToPercent(rate) < LOW_CORRECT_RATE_PERCENT

/**
 * 並べ替えのできる列（見出しの順）
 */
const SORTABLE_COLUMNS: { label: string, sort: AdminPassageStatsSort }[] = [
  { label: PASSAGE_STATS_LABELS.solvedUsers, sort: "solved_users" },
  { label: PASSAGE_STATS_LABELS.solvedAttempts, sort: "solved_attempts" },
  { label: PASSAGE_STATS_LABELS.correctRate, sort: "correct_rate" },
  { label: PASSAGE_STATS_LABELS.averageElapsedSeconds, sort: "average_elapsed_seconds" },
  { label: PASSAGE_STATS_LABELS.overtimeRate, sort: "overtime_rate" },
]

/**
 * 表が空のときの見出しと補足（範囲外のページ・絞り込みで 0 件・問題がまだ無い）
 */
const buildEmptyMessage = (total: number, q: string | undefined): { description: string, title: string } => {
  if (total > 0) return { description: "Previous で最後のページに戻れます。", title: "このページには問題がありません" }
  if (q) return { description: "絞り込みの文字を変えてください。", title: "条件に合う問題がありません" }
  return { description: "公開中の問題と、期間内に解かれた問題を出します。", title: "問題がありません" }
}

/**
 * 問題ごとの成績の表。並べ替え・絞り込み・ページ送りは URL のクエリを変えて API に任せる
 */
export function PassageStatsTable({ list, query }: { list: GetAdminPassageStatsListResponse, query: DashboardQuery }) {
  const totalPages = Math.max(1, Math.ceil(list.total / list.limit))
  const emptyMessage = buildEmptyMessage(list.total, query.q)
  const buildSortHref = (sort: AdminPassageStatsSort) =>
    buildDashboardHref({ ...query, order: query.sort === sort && query.order === "desc" ? "asc" : "desc", page: 1, sort })
  const renderSortableHeader = (sort: AdminPassageStatsSort, label: string) => (
    <SortableHeaderCell key={sort} href={buildSortHref(sort)} isActive={query.sort === sort} label={label} order={query.order} />
  )

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">問題ごとの成績</h3>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">公開中の問題と、期間内に解かれた問題。タイトルを押すと設問ごとの分析を開きます。</p>
      </div>
      <div className={tableFrameClass}>
        <div className={tableToolbarClass}>
          <span className="text-theme-sm text-gray-500 dark:text-gray-400">{formatCount(list.total)} 件</span>
          <TableSearchForm
            action="/"
            hiddenValues={buildDashboardSearchFormValues(query)}
            placeholder="タイトルで絞り込む"
            query={query.q}
          />
        </div>
        <div className="custom-scrollbar overflow-x-auto">
          <table className="min-w-full">
            <thead className="border-b border-gray-100 dark:border-white/5">
              <tr>
                <th className={tableHeadCellClass}>タイトル</th>
                <th className={tableHeadCellClass}>状態</th>
                <th className={tableHeadCellClass}>難易度</th>
                {SORTABLE_COLUMNS.map(column => renderSortableHeader(column.sort, column.label))}
                <th className={tableHeadCellClass}>{PASSAGE_STATS_LABELS.assistRates}</th>
                {renderSortableHeader("published_at", PASSAGE_STATS_LABELS.publishedAt)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {list.passages.map(passage => (
                <tr key={passage.id} className="hover:bg-gray-50 dark:hover:bg-white/2">
                  <td className="min-w-64 px-5 py-4 text-theme-sm">
                    <Link className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90" href={buildPassageAnalyticsHref(passage.id, query.period)}>
                      {passage.title}
                    </Link>
                    <p className="mt-0.5 text-theme-xs text-gray-400">{passage.source.name}</p>
                  </td>
                  <td className={tableCellClass}>
                    <PassageStatsStatusBadge status={passage.status} />
                  </td>
                  <td className={tableCellClass}>{passage.difficulty === null ? EMPTY_VALUE : PASSAGE_DIFFICULTY_LABELS[passage.difficulty]}</td>
                  <td className={`${tableCellClass} font-medium text-gray-800 dark:text-white/90`}>{formatCount(passage.solved_users)}</td>
                  <td className={tableCellClass}>{formatCount(passage.solved_attempts)}</td>
                  <td className={`${tableCellClass} ${isLowCorrectRate(passage.correct_rate) ? "font-medium text-warning-600 dark:text-orange-400" : ""}`}>
                    {formatRate(passage.correct_rate)}
                  </td>
                  <td className={tableCellClass}>{formatElapsedWithLimit(passage.average_elapsed_seconds, passage.time_limit_seconds)}</td>
                  <td className={tableCellClass}>{formatRate(passage.overtime_rate)}</td>
                  <td className={tableCellClass}>{formatAssistRates(passage.assist_rates)}</td>
                  <td className={tableCellClass}>{passage.published_at === null ? EMPTY_VALUE : formatDate(passage.published_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.passages.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-base font-medium text-gray-800 dark:text-white/90">{emptyMessage.title}</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{emptyMessage.description}</p>
          </div>
        )}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-100 px-5 py-4 xl:flex-row dark:border-white/5">
          <span className="text-theme-sm text-gray-500 dark:text-gray-400">
            {formatRowRange({ limit: list.limit, page: list.page, rowCount: list.passages.length, total: list.total }, "件")}
          </span>
          <PaginationLinks buildHref={page => buildDashboardHref({ ...query, page })} page={list.page} totalPages={totalPages} />
        </div>
      </div>
    </div>
  )
}
