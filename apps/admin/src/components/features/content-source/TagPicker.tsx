"use client"

import Link from "next/link"
import { useState } from "react"

import type { GetTagListResponse } from "@repo/api-schema"

import { TagChip } from "@/components/features/tag/TagChip"
import { hintClass } from "@/libs/ui-classes"

type TagOption = GetTagListResponse["tags"][number]

/**
 * 1 ソースに付けられるタグの数（@repo/api-schema の tag_ids の上限と同じ。Client Component で Zod のスキーマを import しないため値を書く）
 */
const MAX_SOURCE_TAGS = 10

/**
 * ソースの技術タグの選択。選んだ id は hidden の input（name="tag_ids"）でフォームに乗せる
 */
export function TagPicker({ defaultSelectedIds, tags }: { defaultSelectedIds: number[], tags: TagOption[] }) {
  const [selectedIds, setSelectedIds] = useState<number[]>(defaultSelectedIds)

  if (tags.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        タグがまだありません。
        <Link className="font-medium text-brand-500 hover:text-brand-600" href="/tags">タグの画面</Link>
        で追加してください。
      </p>
    )
  }

  const isFull = selectedIds.length >= MAX_SOURCE_TAGS
  const toggleTag = (id: number) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]))

  return (
    <div>
      {selectedIds.map((id) => <input key={id} name="tag_ids" type="hidden" value={id} />)}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedIds.includes(tag.id)
          return (
            <button
              key={tag.id}
              disabled={!isSelected && isFull}
              aria-pressed={isSelected}
              className="rounded-full focus-visible:ring-3 focus-visible:ring-brand-500/20 focus-visible:outline-hidden disabled:cursor-not-allowed"
              onClick={() => toggleTag(tag.id)}
              type="button"
            >
              <TagChip color={tag.color} isMuted={!isSelected} name={tag.name} />
            </button>
          )
        })}
      </div>
      <p className={hintClass}>{selectedIds.length} / {MAX_SOURCE_TAGS} 個を選択中</p>
    </div>
  )
}
