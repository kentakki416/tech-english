import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { getAdminPassageStatsPathParamSchema } from "@repo/api-schema"

import { PassageStatsStatusBadge } from "@/components/features/stats/PassageStatsStatusBadge"
import { PeriodTabs } from "@/components/features/stats/PeriodTabs"
import { QuestionStatsCard } from "@/components/features/stats/QuestionStatsCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import Alert from "@/components/ui/alert/Alert"
import { PASSAGE_DIFFICULTY_LABELS } from "@/features/passage/passage.labels"
import { statsApi } from "@/features/stats/stats.api"
import { formatPeriodLabel, PASSAGE_STATS_LABELS } from "@/features/stats/stats.labels"
import { buildDashboardHref, buildPassageAnalyticsHref, convertSearchParamToPeriod } from "@/features/stats/stats.params"
import { formatDate } from "@/libs/format-date"
import { EMPTY_VALUE, formatAssistRates, formatCount, formatElapsedWithLimit, formatRate } from "@/libs/format-stats"
import type { SearchParamValue } from "@/libs/search-params"
import { outlineButtonClass } from "@/libs/ui-classes"

export const metadata: Metadata = {
  title: "問題の分析 | tech-english admin",
}

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ period?: SearchParamValue }>
}

/**
 * URL の id を問題の ID にする。正の整数でない id（`abc`・`0`・`1e3`・`0x10` など）は null（問題の確認・修正の画面と同じ読み方）
 */
const convertPathIdToPassageId = (id: string): number | null => {
  if (!/^\d+$/.test(id)) return null
  const parsed = getAdminPassageStatsPathParamSchema.safeParse({ id })
  return parsed.success ? parsed.data.id : null
}

/**
 * 問題の分析。問題の数字と、設問ごとの正答率・選択肢の割合・要確認の印（admin-dashboard の UI 設計）。問題が無ければ 404。
 * 「ダッシュボードに戻る」は同じ期間のダッシュボードへ（URL には期間しか持たないので、表の並べ替え・絞り込み・ページは戻さない）
 */
export default async function PassageAnalyticsPage({ params, searchParams }: Props) {
  await connection()
  const passageId = convertPathIdToPassageId((await params).id)
  if (passageId === null) notFound()
  const period = convertSearchParamToPeriod((await searchParams).period)
  const stats = await statsApi.getPassage(passageId, period)
  if (!stats) notFound()

  const { passage, questions } = stats
  const summaryItems = [
    { label: PASSAGE_STATS_LABELS.solvedUsers, value: formatCount(passage.solved_users) },
    { label: PASSAGE_STATS_LABELS.solvedAttempts, value: formatCount(passage.solved_attempts) },
    { label: PASSAGE_STATS_LABELS.correctRate, value: formatRate(passage.correct_rate) },
    { label: PASSAGE_STATS_LABELS.averageElapsedSeconds, value: formatElapsedWithLimit(passage.average_elapsed_seconds, passage.time_limit_seconds) },
    { label: PASSAGE_STATS_LABELS.overtimeRate, value: formatRate(passage.overtime_rate) },
    { label: PASSAGE_STATS_LABELS.assistRates, value: formatAssistRates(passage.assist_rates) },
  ]

  return (
    <>
      <PageBreadcrumb pageTitle="問題の分析" />
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="text-theme-sm font-medium text-brand-500 hover:text-brand-600" href={buildDashboardHref({ period })}>
            ← ダッシュボードに戻る
          </Link>
          <PeriodTabs buildHref={item => buildPassageAnalyticsHref(passageId, item)} current={period} />
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <PassageStatsStatusBadge status={passage.status} />
                <span className="text-theme-xs text-gray-400">{passage.difficulty === null ? EMPTY_VALUE : PASSAGE_DIFFICULTY_LABELS[passage.difficulty]}</span>
              </div>
              <h2 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{passage.title}</h2>
              <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
                {passage.source.name}・{PASSAGE_STATS_LABELS.publishedAt} {passage.published_at === null ? EMPTY_VALUE : formatDate(passage.published_at)}
              </p>
            </div>
            <Link className={outlineButtonClass} href={`/passages/${passage.id}`}>確認・修正を開く</Link>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-gray-100 pt-5 sm:grid-cols-3 xl:grid-cols-6 dark:border-gray-800">
            {summaryItems.map(item => (
              <div key={item.label}>
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">{item.label}</dt>
                <dd className="mt-1 text-base font-semibold text-gray-800 tabular-nums dark:text-white/90">{item.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-theme-xs text-gray-400">{formatPeriodLabel(period)}の数字（日本時間）</p>
        </section>

        <Alert
          message="非公開に戻して選択肢や正解を直した問題は、直す前の解答も同じ設問・同じ位置の選択肢として数えます。正誤は提出したときのものです。"
          title="直した問題の数え方"
          variant="info"
        />

        {questions.length === 0 ? (
          <p className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/3 dark:text-gray-400">
            設問がありません
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
            {questions.map(question => (
              <QuestionStatsCard key={question.id} question={question} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
