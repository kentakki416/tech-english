"use client"

/**
 * 並べ替えのできる列の見出し。押すと、その列で並べ替える（同じ列なら向きを逆にする）。今の列には向きの矢印を出す
 */
export function SortHeader({ isActive, label, onClick, order }: { isActive: boolean, label: string, onClick: () => void, order: "asc" | "desc" }) {
  return (
    <button
      aria-label={`${label}で並べ替える`}
      className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-gray-800 dark:hover:text-white/90 ${isActive ? "text-gray-800 dark:text-white/90" : ""}`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span aria-hidden className={`text-[10px] ${isActive ? "" : "text-gray-300 dark:text-gray-600"}`}>
        {isActive ? (order === "desc" ? "▼" : "▲") : "▼"}
      </span>
    </button>
  )
}

/**
 * 表の枠・見出し・セルのクラス（テンプレートの DataTable と同じ見た目）
 */
export const tableFrameClass = "overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3"

export const tableToolbarClass = "flex flex-col items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center dark:border-white/5"

export const tableHeadCellClass = "px-5 py-3 text-start text-theme-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400"

export const tableCellClass = "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 tabular-nums dark:text-gray-400"

export const searchInputClass = "h-10 w-full rounded-lg border border-gray-300 bg-white pr-4 pl-10 text-sm text-gray-700 focus:border-brand-500 focus:outline-none sm:w-[250px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"

/**
 * 表の上の絞り込みの入力欄（虫めがねのアイコン付き）
 */
export function SearchField({ onChange, placeholder, value }: { onChange: (value: string) => void, placeholder: string, value: string }) {
  return (
    <div className="relative w-full sm:w-auto">
      <svg aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <input
        aria-label={placeholder}
        className={searchInputClass}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </div>
  )
}
