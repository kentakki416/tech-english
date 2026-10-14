import type { Metadata } from "next"

import { VocabularySummaryPanel } from "@/components/features/vocabulary/VocabularySummaryPanel"
import { AppHeader } from "@/components/ui/AppHeader"
import { vocabularyApi } from "@/features/vocabulary/vocabulary.api"
import { redirectIfSessionRejected } from "@/libs/session"

export const metadata: Metadata = {
  title: "単語帳",
}

/**
 * 単語帳のトップ。今日の分（今日の復習・新しい単語）と単語の数、今日の分が無ければ次の復習の日。
 * カードの束の見本に今日の 1 枚目の表を出すため、1 回分も一緒に取る（読み取りだけで何も書き込まない）
 */
export default async function VocabularyPage() {
  const [summary, session] = await Promise.all([vocabularyApi.getSummary(), vocabularyApi.getSession()]).catch(redirectIfSessionRejected)

  return (
    <>
      <AppHeader current="vocabulary" />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-xl font-semibold text-fg">単語帳</h1>
        <p className="mt-1 text-sm text-fg-muted">長文で出会った単語を、カードをめくって覚えます。</p>
        <VocabularySummaryPanel firstCard={session.cards[0]} summary={summary} />
      </main>
    </>
  )
}
