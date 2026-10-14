"use client"

import Link from "next/link"
import { useActionState, useState } from "react"

import { DELETE_ACCOUNT_CONFIRMATION_TEXT } from "@repo/api-schema"

import type { DeleteAccountState } from "@/app/settings/delete-account/actions"

type DeleteAccountAction = (prevState: DeleteAccountState, formData: FormData) => Promise<DeleteAccountState>

const DELETED_ITEMS: { description: string, label: string }[] = [
  { description: "名前・アイコン・メールアドレス・タイムゾーン・GitHub アカウントとの紐づけ", label: "アカウント情報" },
  { description: "すべての挑戦・回答・調べた単語。カレンダー・連続日数・統計も消えます", label: "学習の記録" },
  { description: "目標の設定", label: "目標" },
  { description: "設定と、各端末に予約された通知", label: "リマインダー" },
]

/**
 * アカウント削除の確認。`delete my account` と入力するまで削除のボタンを押せない（前後の空白は許す）。
 * 削除は Server Action（useActionState）。成功すると action が完了画面へ redirect するので、ここは失敗だけを表示する
 */
export function DeleteAccountForm({ action }: { action: DeleteAccountAction }) {
  const [state, formAction, isPending] = useActionState(action, { isFailed: false })
  const [confirmation, setConfirmation] = useState("")
  const isMatched = confirmation.trim() === DELETE_ACCOUNT_CONFIRMATION_TEXT

  return (
    <>
      <h1 className="mt-6 text-xl font-semibold text-fg">アカウントを削除</h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        削除はすぐに実行され、取り消せません。次のデータがすべて削除されます。
      </p>
      <dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-surface">
        {DELETED_ITEMS.map(item => (
          <div key={item.label} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm text-fg">{item.label}</dt>
            <dd className="text-sm text-fg-muted">{item.description}</dd>
          </div>
        ))}
      </dl>

      <form action={formAction} className="mt-8">
        <label className="text-sm text-fg" htmlFor="confirmation">
          確認のため <code className="rounded border border-line bg-surface px-1.5 py-0.5 font-code text-[13px] text-wrong">{DELETE_ACCOUNT_CONFIRMATION_TEXT}</code> と入力してください
        </label>
        <input
          autoComplete="off"
          className="mt-3 w-full rounded-lg border border-line-strong bg-canvas px-3 py-2.5 font-code text-sm text-fg outline-none focus:border-wrong/70 focus:ring-2 focus:ring-wrong/30"
          id="confirmation"
          name="confirmation"
          onChange={event => setConfirmation(event.target.value)}
          spellCheck={false}
          value={confirmation}
        />
        {state.isFailed && (
          <p className="mt-4 text-sm text-wrong" role="alert">削除できませんでした。時間をおいてもう一度お試しください。</p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link className="grid h-10 place-items-center rounded-lg px-4 text-sm text-fg-muted hover:bg-raised hover:text-fg" href="/settings">
            キャンセル
          </Link>
          <button
            disabled={!isMatched || isPending}
            className="h-10 rounded-lg bg-wrong px-4 text-sm font-semibold text-canvas outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-wrong/60 disabled:cursor-not-allowed disabled:bg-raised disabled:text-fg-faint"
            type="submit"
          >
            {isPending ? "削除しています…" : "アカウントを削除する"}
          </button>
        </div>
      </form>
    </>
  )
}
