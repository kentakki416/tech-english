import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"

import { getPassagePathParamSchema, type GetPassageResponse } from "@repo/api-schema"

import { DifficultyMeter } from "@/components/features/passage/DifficultyMeter"
import { ResumeNotice } from "@/components/features/passage/ResumeNotice"
import { SourceMeta } from "@/components/features/passage/SourceMeta"
import { StartAttemptForm } from "@/components/features/passage/StartAttemptForm"
import { AppHeader } from "@/components/ui/AppHeader"
import { passageApi } from "@/features/passage/passage.api"
import { ApiClientError } from "@/libs/api-client"
import { formatSeconds } from "@/libs/format"
import { redirectIfSessionRejected } from "@/libs/session"

import { startAttemptAction } from "./actions"

type Props = {
  params: Promise<{ id: string }>
}

/**
 * URL の id を検証して問題の概要を取る。不正な id と API の 404（下書き・存在しない）は null。
 * cache で包み、generateMetadata とページで 1 回の取得にする
 */
const loadPassage = cache(async (rawId: string): Promise<GetPassageResponse | null> => {
  const parsed = getPassagePathParamSchema.safeParse({ id: rawId })
  if (!parsed.success) return null
  try {
    return await passageApi.getDetail(parsed.data.id)
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null
    throw error
  }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const passage = await loadPassage((await params).id).catch(() => null)
  return { title: passage ? passage.title : "問題が見つかりません" }
}

/**
 * 開始確認。本文はまだ見せない。期限内の挑戦中があれば再開の表示にする
 */
export default async function PassageStartPage({ params }: Props) {
  const passage = await loadPassage((await params).id).catch(redirectIfSessionRejected)
  if (passage === null) notFound()

  const { attribution, in_progress_attempt: inProgressAttempt } = passage

  return (
    <>
      <AppHeader current="passages" />
      <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
        <Link className="text-sm text-fg-muted hover:text-fg" href="/passages">問題一覧に戻る</Link>

        <div className="mt-6 rounded-xl border border-line bg-surface">
          <div className="px-6 pt-6 pb-5 sm:px-8 sm:pt-8">
            <SourceMeta kind={attribution.source_kind} name={attribution.source_name} />
            <h1 className="mt-3 font-reading text-[28px] leading-tight font-semibold text-fg">{passage.title}</h1>
          </div>

          <dl className="grid grid-cols-2 border-y border-line sm:grid-cols-4">
            <div className="border-r border-line px-6 py-4 sm:px-5">
              <dt className="text-xs text-fg-muted">難易度</dt>
              <dd className="mt-1.5"><DifficultyMeter level={passage.difficulty} /></dd>
            </div>
            <div className="px-6 py-4 sm:border-r sm:border-line sm:px-5">
              <dt className="text-xs text-fg-muted">英単語数</dt>
              <dd className="mt-1 text-lg font-semibold text-fg tabular-nums">{passage.word_count}<span className="ml-1 text-sm font-normal text-fg-muted">語</span></dd>
            </div>
            <div className="border-t border-r border-line px-6 py-4 sm:border-t-0 sm:px-5">
              <dt className="text-xs text-fg-muted">制限時間</dt>
              <dd className="mt-1 text-lg font-semibold text-fg tabular-nums">{formatSeconds(passage.time_limit_seconds)}</dd>
            </div>
            <div className="border-t border-line px-6 py-4 sm:border-t-0 sm:px-5">
              <dt className="text-xs text-fg-muted">設問</dt>
              <dd className="mt-1 text-lg font-semibold text-fg tabular-nums">{passage.question_count}<span className="ml-1 text-sm font-normal text-fg-muted">問</span></dd>
            </div>
          </dl>

          <div className="px-6 py-6 sm:px-8">
            {inProgressAttempt ? (
              <ResumeNotice
                attemptId={inProgressAttempt.id}
                expiresAt={inProgressAttempt.expires_at}
                questionCount={passage.question_count}
                serverNow={passage.server_now}
                timeLimitSeconds={passage.time_limit_seconds}
              />
            ) : (
              <ul className="space-y-1.5 text-sm leading-relaxed text-fg-muted">
                <li>「開始する」を押すとタイマーが動き、本文が表示されます。</li>
                <li>画面を離れている間と一時停止中はタイマーが止まります。</li>
                <li>時間が過ぎても解き続けられます（超過時間が記録されます）。</li>
              </ul>
            )}
            <StartAttemptForm action={startAttemptAction.bind(null, passage.id)} isResume={inProgressAttempt !== null} />
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-fg-faint">
          出典：{attribution.source_name}（{attribution.license_spdx}）。一部を抜粋・改変しています。
        </p>
      </main>
    </>
  )
}
