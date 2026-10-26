import Link from "next/link"

import type { GetSourceResponse } from "@repo/api-schema"

import { SOURCE_FETCH_TYPE_TAB_LABELS } from "@/features/source/source.labels"
import { isLocalEnvironment } from "@/libs/environment"

type SourceFetchType = GetSourceResponse["source"]["fetch_type"]

/**
 * サイトのソースはローカルだけなので、ローカル以外では [サイト] を出さない
 */
const AVAILABLE_FETCH_TYPES = (["github_repository", "website"] as const).filter((fetchType) => isLocalEnvironment || fetchType !== "website")

/**
 * ソースの一覧・登録の画面の [GitHub] [サイト] の切り替え。ダッシュボードの期間の切り替え（PeriodTabs）と同じ見た目のリンクで、押すと hrefs の画面へ移る
 */
export function SourceFetchTypeTabs({
  counts,
  current,
  hrefs,
}: {
  counts?: Record<SourceFetchType, number>
  current: SourceFetchType
  hrefs: Record<SourceFetchType, string>
}) {
  return (
    <nav aria-label="取得方法" className="inline-flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
      {AVAILABLE_FETCH_TYPES.map((fetchType) => (
        <Link
          key={fetchType}
          aria-current={fetchType === current ? "page" : undefined}
          className={`rounded-md px-4 py-2 text-theme-sm font-medium whitespace-nowrap hover:text-gray-900 dark:hover:text-white ${
            fetchType === current ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          href={hrefs[fetchType]}
        >
          {SOURCE_FETCH_TYPE_TAB_LABELS[fetchType]}
          {counts && <span className="ml-1.5 text-theme-xs text-gray-400 tabular-nums">{counts[fetchType]}</span>}
        </Link>
      ))}
    </nav>
  )
}
