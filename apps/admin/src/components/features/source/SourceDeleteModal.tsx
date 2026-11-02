"use client"

import { useState, useTransition } from "react"

import type { GetSourceListResponse } from "@repo/api-schema"

import { deleteSourceAction } from "@/app/(dashboard)/sources/actions"
import { Modal } from "@/components/ui/modal"
import { SOURCE_DELETE_FAILURE_MESSAGES, type SourceCollectionRunStatus, type SourceDeleteFailureReason } from "@/features/source/source.labels"
import { dangerOutlineButtonClass, outlineButtonClass } from "@/libs/ui-classes"

type SourceListItem = GetSourceListResponse["sources"][number]

/**
 * 一覧のデータで分かる、削除できない理由。解答の記録と音声は分からないので、「削除する」を押したときに api が止める
 */
const findDeletionBlockMessage = (source: SourceListItem, activeStatuses: readonly SourceCollectionRunStatus[]): string | null => {
  if (source.passage_counts.published > 0) return `公開中の問題が ${source.passage_counts.published} 件あるため削除できません。`
  if (source.latest_collection_run !== null && activeStatuses.includes(source.latest_collection_run.status)) {
    return "収集中のため削除できません。終わってからもう一度お試しください。"
  }
  return null
}

const buildPassageImpactMessage = (counts: SourceListItem["passage_counts"]): string => {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  if (total === 0) return "このソースに本文候補はありません。"
  return counts.draft > 0
    ? `本文候補 ${total} 件（下書き ${counts.draft} 件を含む）も一緒に消えます。`
    : `本文候補 ${total} 件も一緒に消えます。`
}

/**
 * ソースの削除の確認のモーダル。削除できないときは理由を出し、「削除する」を出さない
 */
export function SourceDeleteModal({ activeStatuses, onClose, source }: {
  activeStatuses: readonly SourceCollectionRunStatus[]
  onClose: () => void
  source: SourceListItem
}) {
  const [failureReason, setFailureReason] = useState<SourceDeleteFailureReason | null>(null)
  const [isPending, startTransition] = useTransition()
  const blockMessage = findDeletionBlockMessage(source, activeStatuses)
  const message = blockMessage ?? (failureReason === null ? null : SOURCE_DELETE_FAILURE_MESSAGES[failureReason])
  const canDelete = blockMessage === null && failureReason !== "blocked" && failureReason !== "not_found"

  /**
   * 送信中に閉じると、遅れて届いた成功が別のモーダルを閉じてしまうので、送信中は閉じさせない
   */
  const handleClose = () => {
    if (!isPending) onClose()
  }

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteSourceAction(source.id)
      if (result.ok) {
        onClose()
        return
      }
      setFailureReason(result.reason)
    })
  }

  return (
    <Modal className="m-4 max-w-[520px] p-6 lg:p-8" isOpen onClose={handleClose}>
      <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">ソースを削除</h4>
      {message && (
        <div className="mt-4 rounded-xl border border-error-500 bg-error-50 p-4 text-sm dark:border-error-500/30 dark:bg-error-500/15" role="alert">
          <p className="font-medium text-gray-800 dark:text-white/90">{message}</p>
        </div>
      )}
      <div className="mt-6">
        <p className="font-medium text-gray-800 dark:text-white/90">{source.name}</p>
        <p className="mt-1 text-sm break-all text-gray-500 dark:text-gray-400">{source.repository ?? source.site_url}</p>
      </div>
      {canDelete && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {buildPassageImpactMessage(source.passage_counts)}この操作は取り消せません。同じ取得元は登録し直せますが、下書きの修正は戻りません。
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button autoFocus className={outlineButtonClass} onClick={handleClose} type="button">{canDelete ? "キャンセル" : "閉じる"}</button>
        {canDelete && <button className={dangerOutlineButtonClass} disabled={isPending} onClick={handleDelete} type="button">{isPending ? "削除中…" : "削除する"}</button>}
      </div>
    </Modal>
  )
}
