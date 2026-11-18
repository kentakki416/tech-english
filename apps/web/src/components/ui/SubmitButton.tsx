"use client"

import type { ReactNode } from "react"
import { useFormStatus } from "react-dom"

const DEFAULT_CLASS_NAME = "rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"

type SubmitButtonProps = {
  children: ReactNode
  /**
   * 送信中は disabled になるので `disabled:` で表す
   */
  className?: string
  pendingLabel?: ReactNode
}

/**
 * <form> の子孫として描画する。form の外に置くと、useFormStatus の pending が常に false になる
 */
export function SubmitButton({ children, className = DEFAULT_CLASS_NAME, pendingLabel = "送信中..." }: SubmitButtonProps) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
