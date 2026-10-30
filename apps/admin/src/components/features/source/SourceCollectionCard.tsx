"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { requestSourceCollectionAction } from "@/app/(dashboard)/sources/actions"
import Badge from "@/components/ui/badge/Badge"
import {
  SOURCE_COLLECTION_REQUEST_FAILURE_MESSAGES,
  SOURCE_COLLECTION_RUN_STATUS_LABELS,
  type SourceCollectionRequestFailureReason,
  type SourceCollectionRun,
  type SourceCollectionRunStatus,
} from "@/features/source/source.labels"
import { SOURCE_LIST_PATHS } from "@/features/source/source.paths"
import { useCollectionRunRefresh } from "@/hooks/useCollectionRunRefresh"
import { formatDateTime } from "@/libs/date"
import { cardBodyClass, cardClass, descClass, primaryButtonClass, titleClass } from "@/libs/ui-classes"

const describeCollectionRun = (run: SourceCollectionRun): string => {
  const finishedAt = run.finished_at ? formatDateTime(run.finished_at) : ""
  switch (run.status) {
  case "queued":
    return `押した時刻：${formatDateTime(run.created_at)}`
  case "running":
    return `始めた時刻：${run.started_at ? formatDateTime(run.started_at) : formatDateTime(run.created_at)}`
  case "completed":
    return `文書 ${run.fetched_document_count ?? 0} 件を取得、本文候補 ${run.created_passage_count ?? 0} 件を作成（${finishedAt}）`
  case "up_to_date":
    return `前回の収集から変更はありません（${finishedAt}）`
  case "limit_reached":
    return `文書 ${run.fetched_document_count ?? 0} 件・本文候補 ${run.created_passage_count ?? 0} 件で上限に達しました。残りはもう一度押すと続きから取り込みます（${finishedAt}）`
  case "rate_limited":
    return `GitHub の rate limit で打ち切りました。時間をおいてもう一度押すと続きから取り込みます（${finishedAt}）`
  case "failed":
    return `${run.error ?? "理由は分かりません"}（${finishedAt}）`
  }
}

/**
 * 今すぐ収集のボタンと、最後の収集の状態。依頼が通ったらソース一覧へ戻る。収集中の間は画面を読み直し、結果に切り替える。
 * activeStatuses は収集中の状態の値（Server Component が @repo/api-schema から渡す）、isEnabled は保存済みの有効 / 無効
 */
export function SourceCollectionCard({ activeStatuses, isEnabled, run, sourceId }: {
  activeStatuses: readonly SourceCollectionRunStatus[]
  isEnabled: boolean
  run: SourceCollectionRun | null
  sourceId: number
}) {
  const router = useRouter()
  const [failureReason, setFailureReason] = useState<SourceCollectionRequestFailureReason | null>(null)
  const [isPending, startTransition] = useTransition()
  const isActive = run !== null && activeStatuses.includes(run.status)
  useCollectionRunRefresh(isActive)

  /**
   * 依頼が通らなかった理由の文言。読み直しで状態が変わった後に合わなくなるものは出さない
   * （running は収集が終わったら消す。disabled は無効の案内と同じ文なので出さない）
   */
  const failureMessage = failureReason === null
    || (failureReason === "running" && !isActive)
    || failureReason === "disabled"
    ? null
    : SOURCE_COLLECTION_REQUEST_FAILURE_MESSAGES[failureReason]

  const requestCollection = () => {
    setFailureReason(null)
    startTransition(async () => {
      const result = await requestSourceCollectionAction(sourceId).catch(() => ({ ok: false as const, reason: "failed" as const }))
      if (result.ok) {
        router.push(SOURCE_LIST_PATHS.github_repository)
        return
      }
      setFailureReason(result.reason)
    })
  }

  return (
    <section className={cardClass}>
      <div className="px-6 py-5">
        <h3 className={titleClass}>今すぐ収集</h3>
        <p className={descClass}>このソースの GitHub のリポジトリから、変わったファイルを取り込んで本文候補を作ります。問題は作りません。</p>
      </div>
      <div className={`${cardBodyClass} space-y-4 text-sm`}>
        <div>
          <p className="text-gray-500 dark:text-gray-400">最後の収集</p>
          {run ? (
            <div className="mt-2 space-y-1">
              <Badge color={SOURCE_COLLECTION_RUN_STATUS_LABELS[run.status].color} size="sm">
                {SOURCE_COLLECTION_RUN_STATUS_LABELS[run.status].label}
              </Badge>
              <p className="text-theme-xs text-gray-600 dark:text-gray-300">{describeCollectionRun(run)}</p>
            </div>
          ) : (
            <p className="mt-2 text-gray-400">まだ今すぐ収集をしていません</p>
          )}
        </div>
        <button className={`${primaryButtonClass} w-full`} disabled={!isEnabled || isActive || isPending} type="button" onClick={requestCollection}>
          {isActive ? "収集中…" : "今すぐ収集"}
        </button>
        {!isEnabled && <p className="text-theme-xs text-gray-500 dark:text-gray-400">{SOURCE_COLLECTION_REQUEST_FAILURE_MESSAGES.disabled}</p>}
        {failureMessage && <p className="text-theme-xs text-error-500" role="alert">{failureMessage}</p>}
      </div>
    </section>
  )
}
