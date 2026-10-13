"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { retryPassageAudioAction } from "@/app/(dashboard)/passages/[id]/actions"
import ComponentCard from "@/components/layout/ComponentCard"
import Badge from "@/components/ui/badge/Badge"
import { type AdminPassageAudio, AUDIO_STATUS_LABELS } from "@/features/passage/passage.labels"
import { formatDateTime } from "@/libs/format-date"
import { outlineButtonClass } from "@/libs/ui-classes"

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
 * （公開し直した後の確認待ち。非公開に戻した問題の作成済みの音声も、API が準備中として返す）
 */
const listAudioMessages = (audio: AdminPassageAudio): string[] => {
  const previous = audio.generated_at ? [`前回の作成：${formatDateTime(audio.generated_at)}`] : []
  switch (audio.status) {
  case "pending":
    return ["公開から最大 1 時間で作成されます。", ...previous]
  case "generating":
    return ["生成タスクが音声を作成しています。", ...previous]
  case "ready":
    return [`作成日時：${audio.generated_at ? formatDateTime(audio.generated_at) : "―"}`]
  case "failed":
    return [`音声の作成に ${MAX_AUDIO_ATTEMPTS} 回失敗しました。`]
  }
}

/**
 * 読み上げの音声の状態（準備中・生成中・作成済み・失敗）と作成日時。失敗したときは最後のエラーと「再試行」を出す。
 * 再試行は下書きに戻した問題でも押せる（音声が作られるのは公開し直した後）
 */
export function PassageAudioCard({ audio, passageId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { color, label } = AUDIO_STATUS_LABELS[audio.status]
  const isFailed = audio.status === "failed"

  const retryAudio = () => {
    setErrorMessage(null)
    startTransition(async () => {
      const result = await retryPassageAudioAction(passageId)
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
              onClick={retryAudio}
              type="button"
            >
              {isPending ? "再試行中…" : "再試行"}
            </button>
          )}
        </div>
        {isFailed && (
          <pre className="max-h-40 overflow-y-auto rounded-lg bg-gray-50 p-3 font-mono text-theme-xs break-all whitespace-pre-wrap text-gray-700 dark:bg-white/3 dark:text-gray-300">
            {audio.last_error ?? "エラーの記録がありません。"}
          </pre>
        )}
        {isFailed && errorMessage && (
          <p className="text-theme-sm text-error-600 dark:text-error-500" role="alert">{errorMessage}</p>
        )}
      </div>
    </ComponentCard>
  )
}
