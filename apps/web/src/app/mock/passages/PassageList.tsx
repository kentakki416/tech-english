"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import {
  DIFFICULTY_LABELS,
  formatSeconds,
  MOCK_PASSAGE_LIST,
  type MockDifficulty,
  type MockSourceKind,
} from "@/libs/mock-data"

import { DifficultyMeter, ScoreSquares, SourceMeta } from "../_components/parts"

type KindFilter = "all" | MockSourceKind

const KIND_OPTIONS: { key: KindFilter, label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "github", label: "GitHub" },
  { key: "docs", label: "Docs" },
]

const ALL_TAGS = Array.from(new Set(MOCK_PASSAGE_LIST.flatMap(passage => passage.tags))).sort()

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
 * 問題一覧と絞り込み（モック）
 */
export function PassageList({ initialNoResults }: { initialNoResults: boolean }) {
  const [kind, setKind] = useState<KindFilter>("all")
  const [difficulties, setDifficulties] = useState<MockDifficulty[]>(initialNoResults ? [3] : [])
  const [tags, setTags] = useState<string[]>(initialNoResults ? ["python"] : [])
  const [isUnattemptedOnly, setIsUnattemptedOnly] = useState(false)

  const passages = useMemo(
    () =>
      MOCK_PASSAGE_LIST.filter(passage =>
        (kind === "all" || passage.kind === kind)
        && (difficulties.length === 0 || difficulties.includes(passage.difficulty))
        && (tags.length === 0 || passage.tags.some(tag => tags.includes(tag)))
        && (!isUnattemptedOnly || passage.attemptCount === 0)),
    [difficulties, isUnattemptedOnly, kind, tags],
  )

  const toggleDifficulty = (level: MockDifficulty) =>
    setDifficulties(value => (value.includes(level) ? value.filter(item => item !== level) : [...value, level]))
  const toggleTag = (tag: string) =>
    setTags(value => (value.includes(tag) ? value.filter(item => item !== tag) : [...value, tag]))
  const clearFilters = () => {
    setKind("all")
    setDifficulties([])
    setTags([])
    setIsUnattemptedOnly(false)
  }

  return (
    <>
      <div className="mt-6 space-y-3 border-b border-line pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <div aria-label="種別" className="flex rounded-md border border-line p-0.5 text-sm" role="group">
            {KIND_OPTIONS.map(option => (
              <button
                key={option.key}
                aria-pressed={kind === option.key}
                className={`rounded px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-amber/60 ${
                  kind === option.key ? "bg-raised text-fg" : "text-fg-muted hover:text-fg"
                }`}
                onClick={() => setKind(option.key)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div aria-label="難易度" className="flex gap-1.5" role="group">
            {([1, 2, 3] as const).map(level => (
              <FilterChip key={level} isActive={difficulties.includes(level)} onClick={() => toggleDifficulty(level)}>
                {DIFFICULTY_LABELS[level]}
              </FilterChip>
            ))}
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
            <input
              checked={isUnattemptedOnly}
              className="peer sr-only"
              onChange={event => setIsUnattemptedOnly(event.target.checked)}
              type="checkbox"
            />
            <span
              aria-hidden
              className="relative h-5 w-9 rounded-full bg-heat-0 ring-1 ring-line-strong transition-colors peer-checked:bg-amber peer-focus-visible:ring-2 peer-focus-visible:ring-amber/60 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-fg after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-amber-ink"
            />
            未挑戦のみ
          </label>
        </div>
        <div aria-label="技術タグ" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group">
          {ALL_TAGS.map(tag => (
            <FilterChip key={tag} isActive={tags.includes(tag)} onClick={() => toggleTag(tag)}>
              {tag}
            </FilterChip>
          ))}
        </div>
      </div>

      <p className="mt-4 text-xs text-fg-muted tabular-nums">{passages.length} 問</p>

      {passages.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="text-base font-medium text-fg">条件に合う問題がありません</p>
          <p className="mt-2 text-sm text-fg-muted">絞り込みの条件を減らすと、ほかの問題が表示されます。</p>
          <button
            className="mt-5 h-9 rounded-lg border border-line-strong px-4 text-sm text-fg outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-amber/60"
            onClick={clearFilters}
            type="button"
          >
            絞り込みを解除する
          </button>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {passages.map(passage => (
            <li key={passage.id}>
              <Link
                className="group -mx-3 grid gap-x-6 gap-y-2 rounded-lg px-3 py-4 outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-amber/60 md:grid-cols-[minmax(0,1fr)_auto]"
                href={passage.inProgress ? `/mock/passages/${passage.id}?state=resume` : `/mock/passages/${passage.id}`}
              >
                <div className="min-w-0">
                  <p className="truncate font-reading text-[19px] leading-snug text-fg group-hover:text-amber-bright">{passage.title}</p>
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <SourceMeta kind={passage.kind} name={passage.sourceName} />
                    <span className="flex gap-1.5">
                      {passage.tags.map(tag => <span key={tag} className="text-xs text-fg-faint">#{tag}</span>)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-5 text-sm text-fg-muted tabular-nums md:justify-end">
                  <DifficultyMeter level={passage.difficulty} />
                  <span className="w-14 text-right">{passage.wordCount} 語</span>
                  <span className="w-12 text-right">{formatSeconds(passage.timeLimitSeconds)}</span>
                  <span className="flex w-24 items-center justify-end gap-2">
                    {passage.inProgress ? (
                      <span className="rounded border border-amber/50 px-1.5 py-px text-xs text-amber">挑戦中</span>
                    ) : passage.bestCorrect === null ? (
                      <span className="text-xs text-fg-faint">未挑戦</span>
                    ) : (
                      <>
                        <ScoreSquares
                          results={Array.from({ length: passage.questionCount }, (_, index) => index < (passage.bestCorrect ?? 0))}
                          size="sm"
                        />
                        <span className="text-xs text-fg">{passage.bestCorrect}/{passage.questionCount}</span>
                      </>
                    )}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
