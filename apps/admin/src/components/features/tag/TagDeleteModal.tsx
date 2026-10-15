"use client"

import { useState, useTransition } from "react"

import type { GetTagListResponse } from "@repo/api-schema"

import { deleteTagAction } from "@/app/(dashboard)/tags/actions"
import { TagChip } from "@/components/features/tag/TagChip"
import { Modal } from "@/components/ui/modal"
import { dangerOutlineButtonClass, outlineButtonClass } from "@/libs/ui-classes"

type TagListItem = GetTagListResponse["tags"][number]

/**
 * タグの削除の確認のモーダル
 */
export function TagDeleteModal({ onClose, tag }: { onClose: () => void, tag: TagListItem }) {
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteTagAction(tag.id)
      if (result.ok) {
        onClose()
        return
      }
      setMessage(result.message ?? "削除に失敗しました。時間をおいて再度お試しください。")
    })
  }

  return (
    <Modal className="m-4 max-w-[520px] p-6 lg:p-8" isOpen onClose={onClose}>
      <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">タグを削除</h4>
      {message && (
        <div className="mt-4 rounded-xl border border-error-500 bg-error-50 p-4 text-sm dark:border-error-500/30 dark:bg-error-500/15" role="alert">
          <p className="font-medium text-gray-800 dark:text-white/90">{message}</p>
        </div>
      )}
      <div className="mt-6">
        <TagChip color={tag.color} name={tag.name} />
      </div>
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        {tag.source_count > 0
          ? `${tag.source_count} 件のソースで使われています。削除するとソースから外れます。`
          : "このタグはどのソースにも使われていません。"}
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <button className={outlineButtonClass} onClick={onClose} type="button">キャンセル</button>
        <button className={dangerOutlineButtonClass} disabled={isPending} onClick={handleDelete} type="button">{isPending ? "削除中…" : "削除する"}</button>
      </div>
    </Modal>
  )
}
