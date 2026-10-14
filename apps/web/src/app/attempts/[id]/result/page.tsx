import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { getAttemptPathParamSchema, type GetAttemptResponse } from "@repo/api-schema"

import { ClearAttemptProgress } from "@/components/features/attempt/ClearAttemptProgress"
import { ResultScreen } from "@/components/features/attempt/ResultScreen"
import { attemptApi } from "@/features/attempt/attempt.api"
import { ApiClientError } from "@/libs/api-client"

type Props = {
  params: Promise<{ id: string }>
}

/**
 * URL の id を検証して挑戦を取る。不正な id と API の 404（他人の挑戦・存在しない）は null。
 * cache で包み、generateMetadata とページで 1 回の取得にする
 */
const loadAttempt = cache(async (rawId: string): Promise<GetAttemptResponse | null> => {
  const parsed = getAttemptPathParamSchema.safeParse({ id: rawId })
  if (!parsed.success) return null
  try {
    return await attemptApi.getDetail(parsed.data.id)
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null
    throw error
  }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const attempt = await loadAttempt((await params).id).catch(() => null)
  return { title: attempt ? `結果：${attempt.passage.title}` : "挑戦が見つかりません" }
}

/**
 * 結果・解説。提出の直後と、学習履歴から過去の挑戦を開いたときに来る。
 * 共通ヘッダーは出さず、結果画面の上部バーを出す（ResultScreen）。まだ提出していない挑戦は解答画面へ、期限切れは開始確認へ戻す
 */
export default async function AttemptResultPage({ params }: Props) {
  const attempt = await loadAttempt((await params).id)
  if (attempt === null) notFound()

  switch (attempt.status) {
  case "submitted":
    return (
      <>
        <ResultScreen result={attempt} />
        <ClearAttemptProgress attemptId={attempt.id} />
      </>
    )
  case "in_progress":
    redirect(`/attempts/${attempt.id}`)
  case "expired":
    redirect(`/passages/${attempt.passage.id}`)
  }
}
