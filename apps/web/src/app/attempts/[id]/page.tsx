import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { type ExpiredAttempt, getAttemptPathParamSchema, type GetAttemptResponse } from "@repo/api-schema"

import { ClearAttemptProgress } from "@/components/features/attempt/ClearAttemptProgress"
import { SolvingScreen } from "@/components/features/attempt/SolvingScreen"
import { AppHeader } from "@/components/ui/AppHeader"
import { attemptApi } from "@/features/attempt/attempt.api"
import { ApiClientError } from "@/libs/api-client"

import { submitAttemptAction } from "./actions"

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
  return { title: attempt ? attempt.passage.title : "挑戦が見つかりません" }
}

/**
 * 期限切れ（開始から 24 時間たって提出されなかった）の挑戦。学習記録には数えず、開始確認から新しく始めてもらう。
 * もう提出できないので端末の途中経過を消す
 */
function ExpiredAttemptNotice({ attempt }: { attempt: ExpiredAttempt }) {
  return (
    <>
      <ClearAttemptProgress attemptId={attempt.id} />
      <AppHeader current="passages" />
      <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
        <Link className="text-sm text-fg-muted hover:text-fg" href="/passages">問題一覧に戻る</Link>
        <div className="mt-6 rounded-xl border border-line bg-surface px-6 py-7 sm:px-8 sm:py-8">
          <p className="font-reading text-[17px] leading-snug text-fg-muted">{attempt.passage.title}</p>
          <h1 className="mt-3 text-xl font-semibold text-fg">この挑戦は期限切れです</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            開始から 24 時間が過ぎたため、この挑戦は提出できません。問題を開くと、新しく挑戦できます。
          </p>
          <Link
            className="mt-6 grid h-12 w-full place-items-center rounded-lg bg-amber text-base font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            href={`/passages/${attempt.passage.id}`}
          >
            問題を開く
          </Link>
        </div>
      </main>
    </>
  )
}

/**
 * 問題を解く画面。解答中は共通ヘッダーを出さず、専用の上部バーとステータスバーで挟む（SolvingScreen）。
 * 提出済みなら結果画面へ、期限切れなら案内を出す
 */
export default async function AttemptPage({ params }: Props) {
  const attempt = await loadAttempt((await params).id)
  if (attempt === null) notFound()

  switch (attempt.status) {
  case "in_progress":
    return <SolvingScreen attempt={attempt} submitAction={submitAttemptAction.bind(null, attempt.id)} />
  case "submitted":
    redirect(`/attempts/${attempt.id}/result`)
  case "expired":
    return <ExpiredAttemptNotice attempt={attempt} />
  }
}
