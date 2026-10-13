"use client"

import { useActionState } from "react"

import type { StartAttemptState } from "@/app/passages/[id]/actions"
import { SubmitButton } from "@/components/ui/SubmitButton"

type StartAttemptAction = (prev: StartAttemptState, formData: FormData) => Promise<StartAttemptState>

/**
 * 開始確認の「開始する」/「再開する」。送信中は無効にし、失敗したらボタンの下に理由を出す
 */
export function StartAttemptForm({ action, isResume }: { action: StartAttemptAction, isResume: boolean }) {
  const [state, formAction] = useActionState(action, {})

  return (
    <form action={formAction} className="mt-6">
      <SubmitButton
        className="grid h-12 w-full place-items-center rounded-lg bg-amber text-base font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-wait disabled:opacity-70"
        pendingLabel={isResume ? "再開しています…" : "開始しています…"}
      >
        {isResume ? "再開する" : "開始する"}
      </SubmitButton>
      {state.message && <p className="mt-3 text-sm text-wrong" role="alert">{state.message}</p>}
    </form>
  )
}
