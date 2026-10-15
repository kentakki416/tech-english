import Form from "next/form"
import Link from "next/link"
import type { ReactNode } from "react"

/**
 * 並べ替え・絞り込み・ページ送りを URL のクエリで行う表の部品（Server Component。ダッシュボードとユーザー一覧）。
 * 見た目はテンプレートの DataTable にそろえる
 */

export const tableFrameClass = "overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3"

export const tableToolbarClass = "flex flex-col items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center dark:border-white/5"

export const tableHeadCellClass = "px-5 py-3 text-start text-theme-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400"

export const tableCellClass = "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 tabular-nums dark:text-gray-400"

const searchInputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white pr-4 pl-10 text-sm text-gray-700 focus:border-brand-500 focus:outline-none sm:w-[250px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"

/**
 * 並べ替えのできる列の見出しのセル（th）。中身は href へのリンク（並べ替えの向きは呼び出し側が href で決める）。今の列には向きの矢印と aria-sort を付ける
 */
export function SortableHeaderCell({ href, isActive, label, order }: { href: string, isActive: boolean, label: string, order: "asc" | "desc" }) {
  return (
    <th aria-sort={isActive ? (order === "desc" ? "descending" : "ascending") : "none"} className={tableHeadCellClass}>
      <Link
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-gray-800 dark:hover:text-white/90 ${isActive ? "text-gray-800 dark:text-white/90" : ""}`}
        href={href}
        scroll={false}
      >
        {label}
        <span aria-hidden className={`text-[10px] ${isActive ? "" : "text-gray-300 dark:text-gray-600"}`}>
          {isActive && order === "asc" ? "▲" : "▼"}
        </span>
      </Link>
    </th>
  )
}

/**
 * 表の上の絞り込みの入力欄。next/form で action の URL にクエリを付けて移る（ページ全体は読み直さない）。
 * 今の期間・並べ替えは hiddenValues で残し、ページは送らない（1 ページ目に戻る）
 */
export function TableSearchForm({ action, hiddenValues, placeholder, query }: { action: string, hiddenValues: Record<string, string>, placeholder: string, query?: string }) {
  return (
    <Form action={action} className="relative w-full sm:w-auto" role="search" scroll={false}>
      {Object.entries(hiddenValues).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <svg aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <input aria-label={placeholder} className={searchInputClass} defaultValue={query} name="q" placeholder={placeholder} type="search" />
    </Form>
  )
}

const pageButtonClass = "flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm font-medium"

/**
 * ページ送り（テンプレートの Pagination と同じ見た目のリンク）。今のページの前後 1 ページずつを出す。
 * 範囲外のページ（件数が減った後の古い URL など）では、Previous を最後のページへのリンクにする
 */
export function PaginationLinks({ buildHref, page, totalPages }: { buildHref: (page: number) => string, page: number, totalPages: number }) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(item => Math.abs(item - page) <= 1)
  const renderEdge = (target: number, label: string, isDisabled: boolean): ReactNode =>
    isDisabled ? (
      <span className="mr-2.5 flex h-10 items-center rounded-lg border border-gray-300 bg-white px-3.5 text-sm text-gray-700 opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        {label}
      </span>
    ) : (
      <Link
        className="mr-2.5 flex h-10 items-center rounded-lg border border-gray-300 bg-white px-3.5 text-sm text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/3"
        href={buildHref(target)}
        scroll={false}
      >
        {label}
      </Link>
    )
  return (
    <nav aria-label="ページ送り" className="flex items-center">
      {renderEdge(Math.min(page - 1, totalPages), "Previous", page <= 1)}
      <div className="flex items-center gap-2">
        {pages.map(item => (
          <Link
            key={item}
            aria-current={item === page ? "page" : undefined}
            className={`${pageButtonClass} ${item === page ? "bg-brand-500 text-white" : "text-gray-700 hover:bg-blue-500/8 hover:text-brand-500 dark:text-gray-400"}`}
            href={buildHref(item)}
            scroll={false}
          >
            {item}
          </Link>
        ))}
      </div>
      <span className="ml-2.5">{renderEdge(page + 1, "Next", page >= totalPages)}</span>
    </nav>
  )
}
