import type { Metadata } from "next"

import { VocabularySession } from "@/components/features/vocabulary/VocabularySession"
import { vocabularyApi } from "@/features/vocabulary/vocabulary.api"
import { redirectIfSessionRejected } from "@/libs/session"

import { reviewVocabularyCardAction } from "./actions"

export const metadata: Metadata = {
  title: "単語帳",
}

/**
 * 1 回分のカード。カードが無ければ「今日の分は終わりました」を出す（次の復習の日を出すため summary も取る）。
 * 描くたびに key を変えて、「もう 1 回」の router.refresh() で VocabularySession を作り直す（前の回の state を持ち越さない）
 */
export default async function VocabularySessionPage() {
  const session = await vocabularyApi.getSession().catch(redirectIfSessionRejected)
  const summary = session.cards.length === 0 ? await vocabularyApi.getSummary().catch(redirectIfSessionRejected) : null

  return (
    <VocabularySession
      key={crypto.randomUUID()}
      cards={session.cards}
      nextDueDate={summary?.next_due_date ?? null}
      reviewAction={reviewVocabularyCardAction}
    />
  )
}
