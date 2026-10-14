import type { Metadata } from "next"

import { HistoryList } from "@/components/features/learning-record/HistoryList"
import { AppHeader } from "@/components/ui/AppHeader"
import { learningRecordApi } from "@/features/learning-record/learning-record.api"

export const metadata: Metadata = {
  title: "学習履歴",
}

/**
 * 学習履歴。1 ページ目をここで取り、続きは HistoryList が「さらに表示」で取得する
 */
export default async function HistoryPage() {
  const page = await learningRecordApi.getAttempts()

  return (
    <>
      <AppHeader current="history" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-xl font-semibold text-fg">学習履歴</h1>
        <p className="mt-1 text-sm text-fg-muted">提出した挑戦を新しい順に表示しています。</p>
        <HistoryList initialAttempts={page.attempts} initialNextCursor={page.next_cursor} />
      </main>
    </>
  )
}
