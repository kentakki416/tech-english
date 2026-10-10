import Link from "next/link"

import { AppHeader } from "../../_components/AppHeader"
import { MockStatePanel } from "../../_components/MockStatePanel"

import { DeleteAccountForm } from "./DeleteAccountForm"

const STATES = [
  { key: "confirm", label: "確認" },
  { key: "done", label: "削除完了" },
]

/**
 * アカウント削除の確認（モック）
 */
export default async function MockDeleteAccountPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const isDone = state === "done"
  return (
    <>
      {!isDone && <AppHeader current="settings" />}
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        {!isDone && <Link className="text-sm text-fg-muted hover:text-fg" href="/mock/settings">設定に戻る</Link>}
        <DeleteAccountForm key={isDone ? "done" : "confirm"} initialDone={isDone} />
      </main>
      <MockStatePanel basePath="/mock/settings/delete-account" current={isDone ? "done" : "confirm"} states={STATES} />
    </>
  )
}
