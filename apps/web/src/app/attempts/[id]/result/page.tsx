import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { getAttemptPathParamSchema, type GetAttemptResponse } from "@repo/api-schema"

import { ClearAttemptProgress } from "@/components/features/attempt/ClearAttemptProgress"
import { ResultScreen } from "@/components/features/attempt/ResultScreen"
import { attemptApi } from "@/features/attempt/attempt.api"
import { ApiClientError } from "@/libs/api-client"
import { redirectIfSessionRejected } from "@/libs/session"

type Props = {
  params: Promise<{ id: string }>
}

/**
 * 不正な id と API の 404（他人の挑戦・存在しない）は null。
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

export default async function AttemptResultPage({ params }: Props) {
  const attempt = await loadAttempt((await params).id).catch(redirectIfSessionRejected)
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
