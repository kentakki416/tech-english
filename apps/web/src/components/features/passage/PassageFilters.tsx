"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useTransition } from "react"

import { buildPassageListPath, type PassageFilterQuery } from "@/features/passage/passage-query"

import { DIFFICULTY_LABELS, DIFFICULTY_ORDER, type PassageDifficulty } from "./labels"

/**
 * 配列に値があれば除き、無ければ足す
 */
const toggleItem = <T,>(items: T[], item: T): T[] =>
  items.includes(item) ? items.filter(value => value !== item) : [...items, item]

function FilterChip({ children, isActive, onClick }: { children: React.ReactNode, isActive: boolean, onClick: () => void }) {
  return (
    <button
      aria-pressed={isActive}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber/60 ${
        isActive ? "border-amber/60 bg-amber-wash text-amber" : "border-line text-fg-muted hover:border-line-strong hover:text-fg"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

/**
 * 問題一覧の絞り込み（難易度・技術タグ・未挑戦のみ）。
 * 押したらすぐ URL のクエリを書き換え、Server Component が一覧を取り直す（適用ボタンは無い）。
 * 取り直している間は children（件数と一覧）を薄くする
 */
export function PassageFilters({
  children,
  filter,
  tags,
}: {
  children: React.ReactNode
  filter: PassageFilterQuery
  tags: string[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  /**
   * URL の反映を待たずにチップの状態を変える（続けて押しても前の選択を失わない）
   */
  const [optimisticFilter, setOptimisticFilter] = useOptimistic(filter)

  /**
   * URL で指定されたが一覧に無いタグも、外せるようにチップに出す
   */
  const tagOptions = Array.from(new Set([...tags, ...optimisticFilter.tag])).sort()

  const applyFilter = (next: PassageFilterQuery) => {
    startTransition(() => {
      setOptimisticFilter(next)
      router.replace(buildPassageListPath(next), { scroll: false })
    })
  }

  const toggleDifficulty = (level: PassageDifficulty) =>
    applyFilter({ ...optimisticFilter, difficulty: toggleItem(optimisticFilter.difficulty, level) })
  const toggleTag = (tag: string) =>
    applyFilter({ ...optimisticFilter, tag: toggleItem(optimisticFilter.tag, tag) })

  return (
    <>
      <div className="mt-6 space-y-3 border-b border-line pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <div aria-label="難易度" className="flex gap-1.5" role="group">
            {DIFFICULTY_ORDER.map(level => (
              <FilterChip
                key={level}
                isActive={optimisticFilter.difficulty.includes(level)}
                onClick={() => toggleDifficulty(level)}
              >
                {DIFFICULTY_LABELS[level]}
              </FilterChip>
            ))}
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
            <input
              checked={optimisticFilter.unattemptedOnly}
              className="peer sr-only"
              onChange={event => applyFilter({ ...optimisticFilter, unattemptedOnly: event.target.checked })}
              type="checkbox"
            />
            <span
              aria-hidden
              className="relative h-5 w-9 rounded-full bg-heat-0 ring-1 ring-line-strong transition-colors peer-checked:bg-amber peer-focus-visible:ring-2 peer-focus-visible:ring-amber/60 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-fg after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-amber-ink"
            />
            未挑戦のみ
          </label>
        </div>
        {tagOptions.length > 0 && (
          <div aria-label="技術タグ" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group">
            {tagOptions.map(tag => (
              <FilterChip key={tag} isActive={optimisticFilter.tag.includes(tag)} onClick={() => toggleTag(tag)}>
                {tag}
              </FilterChip>
            ))}
          </div>
        )}
      </div>
      <div aria-busy={isPending} className={`transition-opacity ${isPending ? "opacity-60" : ""}`}>
        {children}
      </div>
    </>
  )
}
