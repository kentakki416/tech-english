"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
  type PassageActionResult,
  regeneratePassageAudioAction,
  retryPassageAudioAction,
} from "@/app/(dashboard)/passages/[id]/actions"
import ComponentCard from "@/components/layout/ComponentCard"
import Badge from "@/components/ui/badge/Badge"
import { Modal } from "@/components/ui/modal"
import { type AdminPassageAudio, AUDIO_STATUS_LABELS } from "@/features/passage/passage.labels"
import { formatDateTime } from "@/libs/date"
import { outlineButtonClass, primaryButtonClass } from "@/libs/ui-classes"

type Props = {
  audio: AdminPassageAudio
  passageId: number
}

/**
 * 失敗にする試行の回数（cron の generate:audio の MAX_AUDIO_ATTEMPTS）。API は試行の回数を返さないので、文言にだけ使う
 */
const MAX_AUDIO_ATTEMPTS = 3

/**
 * 状態ごとの本文（README の「音声ができるまで」）。準備中・生成中は、前に作った音声があれば前回の作成日時も出す
 * （公開し直した後の確認待ち。非公開に戻した問題の作成済みの音声も、API が準備中として返す）。
 * 作成済みで作り直しの依頼があれば、依頼の日時も出す（作り直すまでは今の音声のまま）
 */
const listAudioMessages = (audio: AdminPassageAudio): string[] => {
  const previous = audio.generated_at ? [`前回の作成：${formatDateTime(audio.generated_at)}`] : []
  switch (audio.status) {
  case "pending":
    return ["公開から最大 1 時間で作成されます。", ...previous]
  case "generating":
    return ["生成タスクが音声を作成しています。", ...previous]
  case "ready": {
    const created = `作成日時：${audio.generated_at ? formatDateTime(audio.generated_at) : "―"}`
    if (!audio.regenerate_requested_at) return [created]
    return [created, `作り直しを待っています（依頼：${formatDateTime(audio.regenerate_requested_at)}）`]
  }
  case "failed":
    return [`音声の作成に ${MAX_AUDIO_ATTEMPTS} 回失敗しました。`]
  }
}

/**
 * 読み上げの音声の状態（準備中・生成中・作成済み・失敗）と作成日時。失敗したときは最後のエラーと「再試行」、
 * 作成済みのときは「作り直す」（確認のダイアログあり。依頼中は「作り直しを待っています」を出してボタンは出さない）を出す。
 * 作成済みでエラーがあるのは、voice の変更・作り直しに失敗して前の音声を出し続けているとき。
 * 再試行は下書きに戻した問題でも押せる（音声が作られるのは公開し直した後）
 */
export function PassageAudioCard({ audio, passageId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false)
  const { color, label } = AUDIO_STATUS_LABELS[audio.status]
  const isFailed = audio.status === "failed"
  const canRegenerate = audio.status === "ready" && audio.regenerate_requested_at === null
  const hasReadyError = audio.status === "ready" && audio.last_error !== null

  const runAudioAction = (action: (id: number) => Promise<PassageActionResult>) => {
    setErrorMessage(null)
    startTransition(async () => {
      const result = await action(passageId)
      setIsRegenerateOpen(false)
      if (!result.ok) {
        setErrorMessage(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <ComponentCard desc="公開した問題の本文を Amazon Polly で読み上げた音声" title="読み上げの音声">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-theme-sm text-gray-700 dark:text-gray-300">
            <Badge color={color} size="sm">{label}</Badge>
            {listAudioMessages(audio).map((message) => <span key={message}>{message}</span>)}
          </div>
          {isFailed && (
            <button
              className={`${outlineButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={isPending}
              onClick={() => runAudioAction(retryPassageAudioAction)}
              type="button"
            >
              {isPending ? "再試行中…" : "再試行"}
            </button>
          )}
          {canRegenerate && (
            <button
              className={`${outlineButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={isPending}
              onClick={() => setIsRegenerateOpen(true)}
              type="button"
            >
              作り直す
            </button>
          )}
        </div>
        {hasReadyError && (
          <p className="text-theme-sm text-gray-700 dark:text-gray-300">作り直しに失敗しています（今の音声を出し続けています）。</p>
        )}
        {(isFailed || hasReadyError) && (
          <pre className="max-h-40 overflow-y-auto rounded-lg bg-gray-50 p-3 font-mono text-theme-xs break-all whitespace-pre-wrap text-gray-700 dark:bg-white/3 dark:text-gray-300">
            {audio.last_error ?? "エラーの記録がありません。"}
          </pre>
        )}
        {errorMessage && (
          <p className="text-theme-sm text-error-600 dark:text-error-500" role="alert">{errorMessage}</p>
        )}
      </div>

      <Modal className="m-4 max-w-[520px] p-6 lg:p-8" isOpen={isRegenerateOpen} onClose={() => setIsRegenerateOpen(false)}>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">読み上げの音声を作り直す</h4>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          次回の生成タスク（最大 1 時間後）で、本文が同じでも Amazon Polly で音声を作り直します（1 問 約 12 円。月の上限に数えます）。
          作り直すまでは今の音声を出し続けます。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button className={outlineButtonClass} onClick={() => setIsRegenerateOpen(false)} type="button">キャンセル</button>
          <button
            className={primaryButtonClass}
            disabled={isPending}
            onClick={() => runAudioAction(regeneratePassageAudioAction)}
            type="button"
          >
            {isPending ? "依頼中…" : "作り直す"}
          </button>
        </div>
      </Modal>
    </ComponentCard>
  )
}
