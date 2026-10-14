import type { Metadata } from "next"
import Link from "next/link"

import { DeleteAccountForm } from "@/components/features/user/DeleteAccountForm"
import { AppHeader } from "@/components/ui/AppHeader"

import { deleteAccountAction } from "./actions"

export const metadata: Metadata = {
  title: "アカウントを削除",
}

/**
 * アカウント削除の確認（設定画面の「危険な操作」から開く）。完了の表示は `/settings/delete-account/done`
 */
export default function DeleteAccountPage() {
  return (
    <>
      <AppHeader current="settings" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <Link className="text-sm text-fg-muted hover:text-fg" href="/settings">設定に戻る</Link>
        <DeleteAccountForm action={deleteAccountAction} />
      </main>
    </>
  )
}
