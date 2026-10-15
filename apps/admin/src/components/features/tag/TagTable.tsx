"use client"

import { useState } from "react"

import type { GetTagListResponse } from "@repo/api-schema"

import { TagChip, type TagColor } from "@/components/features/tag/TagChip"
import { TagDeleteModal } from "@/components/features/tag/TagDeleteModal"
import { TagFormModal } from "@/components/features/tag/TagFormModal"
import { type Column, DataTable } from "@/components/ui/table"
import { primaryButtonClass } from "@/libs/ui-classes"

type TagListItem = GetTagListResponse["tags"][number]

/**
 * 開いているモーダル。null は閉じている
 */
type OpenModal = { kind: "create" } | { kind: "delete", tag: TagListItem } | { kind: "edit", tag: TagListItem } | null

const buildColumns = (openModal: (modal: OpenModal) => void): Column<TagListItem>[] => [
  { header: "タグ", render: (row) => <TagChip color={row.color} name={row.name} /> },
  {
    className: "px-5 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400",
    header: "使っているソース",
    render: (row) => (row.source_count > 0 ? `${row.source_count} 件` : <span className="text-gray-300 dark:text-gray-600">―</span>),
  },
  {
    className: "px-5 py-4 text-right text-theme-sm whitespace-nowrap",
    header: "",
    render: (row) => (
      <div className="flex justify-end gap-4">
        <button aria-label={`${row.name} を編集`} className="font-medium text-brand-500 hover:text-brand-600" onClick={() => openModal({ kind: "edit", tag: row })} type="button">編集</button>
        <button aria-label={`${row.name} を削除`} className="font-medium text-error-600 hover:text-error-700 dark:text-error-500" onClick={() => openModal({ kind: "delete", tag: row })} type="button">削除</button>
      </div>
    ),
  },
]

/**
 * タグの一覧の表。追加・編集・削除のモーダルの開閉もここで持つ
 */
export function TagTable({ colors, tags }: { colors: readonly TagColor[], tags: TagListItem[] }) {
  const [openModal, setOpenModal] = useState<OpenModal>(null)
  const closeModal = () => setOpenModal(null)

  return (
    <>
      <div className="flex justify-end">
        <button className={primaryButtonClass} onClick={() => setOpenModal({ kind: "create" })} type="button">タグを追加</button>
      </div>
      <DataTable
        columns={buildColumns(setOpenModal)}
        data={tags}
        emptyMessage={
          <div>
            <p className="text-base font-medium text-gray-800 dark:text-white/90">まだタグがありません</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">タグを追加すると、ソースの登録・編集で選べるようになります。</p>
          </div>
        }
        getRowKey={(row) => row.id}
      />
      {/**
        * key でタグごとに作り直す（別のタグの編集を開いたときに、前の入力・エラーを残さない）
        */}
      {(openModal?.kind === "create" || openModal?.kind === "edit") && (
        <TagFormModal key={openModal.kind === "edit" ? openModal.tag.id : "create"} colors={colors} onClose={closeModal} tag={openModal.kind === "edit" ? openModal.tag : null} />
      )}
      {openModal?.kind === "delete" && <TagDeleteModal key={openModal.tag.id} onClose={closeModal} tag={openModal.tag} />}
    </>
  )
}
