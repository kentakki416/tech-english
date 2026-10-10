"use client"

import { useFormStatus } from "react-dom"

function ConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      onClick={(e) => { if (!confirm("このメモを削除しますか？")) e.preventDefault() }}
      className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 disabled:opacity-50">
      {pending ? "削除中…" : "削除"}
    </button>
  )
}

/** action は Server Action（id を bind 済み）を親から受け取る */
export function DeleteMemoButton({ action }: { action: () => Promise<void> }) {
  return <form action={action}><ConfirmButton /></form>
}