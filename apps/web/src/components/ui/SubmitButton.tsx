"use client"

import type { ReactNode } from "react"
import { useFormStatus } from "react-dom"

type SubmitButtonProps = {
  children: ReactNode
}

/**
 * form 送信ボタン。useFormStatus で親 form の pending を取り、送信中は無効化する。
 *
 * useFormStatus の制約上、必ず <form> の子孫として描画すること
 * （form の外に置くと pending が常に false になる）。
 *
 * ラベルはドメイン非依存にするため props で受け取る:
 *   <SubmitButton pendingLabel="作成中…">作成する</SubmitButton>
 */
export function SubmitButton({ children }: SubmitButtonProps) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
    >
      {pending ? "送信中..." : children}
    </button>
  )
}
