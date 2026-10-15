import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import type { AdminStatsPeriod } from "@repo/api-schema"

import { formatPeriodLabel, PeriodTabs } from "@/components/features/stats/PeriodTabs"
import { QuestionStatsCard } from "@/components/features/stats/QuestionStatsCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import Alert from "@/components/ui/alert/Alert"
import Badge from "@/components/ui/badge/Badge"
import { PASSAGE_DIFFICULTY_LABELS, PASSAGE_STATUS_LABELS } from "@/features/passage/passage.labels"
import { statsApi } from "@/features/stats/stats.api"
import { buildPassageAnalyticsHref, convertSearchParamToPeriod } from "@/features/stats/stats.params"
import { formatDateTime } from "@/libs/format-date"
import { EMPTY_VALUE, formatCount, formatElapsedWithLimit, formatRate } from "@/libs/format-stats"
import { outlineButtonClass } from "@/libs/ui-classes"

export const metadata: Metadata = {
  title: "問題の分析 | tech-english admin",
}

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ period?: string | string[] }>
}

/**
 * 問題の分析。問題の数字と、設問ごとの正答率・選択肢の割合・要確認の印（admin-dashboard の UI 設計）。問題が無ければ 404
 */
export default async function PassageAnalyticsPage({ params, searchParams }: Props) {
  await connection()
  const { id } = await params
  const passageId = Number(id)
  if (!Number.isInteger(passageId) || passageId <= 0) notFound()
  const period = convertSearchParamToPeriod((await searchParams).period)
  const stats = await statsApi.getPassage(passageId, period)
  if (!stats) notFound()

  const { passage, questions } = stats
  const hrefByPeriod = Object.fromEntries(
    (["7d", "30d", "all"] as const).map(item => [item, buildPassageAnalyticsHref(passageId, item)]),
  ) as Record<AdminStatsPeriod, string>
  const summaryItems = [
    { label: "解いた人数", value: formatCount(passage.solved_users) },
    { label: "解いた回数", value: formatCount(passage.solved_attempts) },
    { label: "正答率", value: formatRate(passage.correct_rate) },
    { label: "平均時間 / 制限", value: formatElapsedWithLimit(passage.average_elapsed_seconds, passage.time_limit_seconds) },
    { label: "時間超過", value: formatRate(passage.overtime_rate) },
    {
      label: "アシスト（和訳 / 単語 / 読み上げ）",
      value: `${formatRate(passage.assist_rates.translated)} / ${formatRate(passage.assist_rates.looked_up)} / ${formatRate(passage.assist_rates.listened)}`,
    },
  ]

  return (
    <>
      <PageBreadcrumb pageTitle="問題の分析" />
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="text-theme-sm font-medium text-brand-500 hover:text-brand-600" href={`/?period=${period}`}>
            ← ダッシュボードに戻る
          </Link>
          <PeriodTabs current={period} hrefByPeriod={hrefByPeriod} />
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={passage.status === "published" ? "success" : "light"} size="sm">
                  {passage.status === "published" ? PASSAGE_STATUS_LABELS.published : "非公開"}
                </Badge>
                <span className="text-theme-xs text-gray-400">{passage.difficulty === null ? EMPTY_VALUE : PASSAGE_DIFFICULTY_LABELS[passage.difficulty]}</span>
              </div>
              <h2 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{passage.title}</h2>
              <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
                {passage.source.name}・公開日 {passage.published_at === null ? EMPTY_VALUE : formatDateTime(passage.published_at).slice(0, 10)}
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

        <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
          {questions.map(question => (
            <QuestionStatsCard key={question.id} question={question} />
          ))}
        </div>
      </div>
    </>
  )
}
