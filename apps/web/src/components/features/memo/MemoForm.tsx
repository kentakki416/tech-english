"use client"

import { useActionState } from "react"

import type { MemoFormState } from "@/app/memos/actions"
import { SubmitButton } from "@/components/ui/SubmitButton"

type MemoAction = (prev: MemoFormState, formData: FormData) => Promise<MemoFormState>

type Props = {
  action: MemoAction,
  defaultValues?: { title?: string, body?: string }
  submitLabel: string
}

/**
 * メモ用のフォーム
 */
export function MemoForm({ action, defaultValues, submitLabel = "保存する" }: Props) {
  const [state, formAction] = useActionState(action, {})

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">タイトル</label>
        <input name="title" className="mt-1 w-full rounded border border-zinc-300 p-2" defaultValue={defaultValues?.title} />
        {state.errors?.title && (
          <p className="mt-1 text-sm text-red-600">{state.errors.title[0]}</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium">本文</label>
        <textarea name="body" rows={6} className="mt-1 w-full rounded border border-zinc-300 p-2" defaultValue={defaultValues?.body} />
        {state.errors?.body && (
          <p className="mt-1 text-sm text-red-600">{state.errors.body[0]}</p>
        )}
      </div>
      {state.message && <p className="text-sm text-red-600">{state.message}</p>}
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  )
}