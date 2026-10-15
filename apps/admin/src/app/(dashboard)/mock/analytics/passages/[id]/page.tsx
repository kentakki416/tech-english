import Link from "next/link"

import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import Alert from "@/components/ui/alert/Alert"
import Badge from "@/components/ui/badge/Badge"
import { type AdminStatsPeriod, MOCK_PASSAGE_STATS, MOCK_QUESTION_STATS, PASSAGE_STATUS_LABELS, STATS_PERIOD_LABELS } from "@/libs/mock-data"

import { MockStatePanel } from "../../../_components/MockStatePanel"
import { PeriodTabs } from "../../../_components/PeriodTabs"
import { formatCount, formatElapsedWithLimit, formatRate } from "../../../_components/stats-format"
import { outlineButtonClass } from "../../../_components/ui"

import { QuestionStatsCard } from "./QuestionStatsCard"

const DIFFICULTY_LABELS = { 1: "Easy", 2: "Normal", 3: "Hard" }

/**
 * 解いた回数がこれより少ないと「要確認」の印を付けない（本実装は ADMIN_QUESTION_REVIEW_MIN_ATTEMPTS）
 */
const FEW_ATTEMPTS = 3

const parsePeriod = (value: string | undefined): AdminStatsPeriod => (value === "7d" || value === "all" ? value : "30d")

/**
 * 問題の分析（モック）。設問は What Is Ownership? のものを、どの問題でも出す
 */
export default async function MockPassageAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ period?: string, state?: string }>
}) {
  const { id } = await params
  const { period: rawPeriod, state } = await searchParams
  const period = parsePeriod(rawPeriod)
  const current = state === "few" || state === "unsolved" ? state : "normal"
  const basePath = `/mock/analytics/passages/${id}`
  const found = MOCK_PASSAGE_STATS[period].find(row => row.id === Number(id)) ?? MOCK_PASSAGE_STATS[period][0]
  const solvedAttempts = current === "unsolved" ? 0 : current === "few" ? FEW_ATTEMPTS : found.solvedAttempts
  const isSolved = solvedAttempts > 0
  const passage = {
    ...found,
    solvedAttempts,
    solvedUsers: current === "unsolved" ? 0 : current === "few" ? FEW_ATTEMPTS : found.solvedUsers,
  }

  const states = [
    { href: `${basePath}?period=${period}`, key: "normal", label: "通常（Q2・Q4 が要確認）" },
    { href: `${basePath}?period=${period}&state=few`, key: "few", label: "解いた回数が 5 回未満（要確認を出さない）" },
    { href: `${basePath}?period=${period}&state=unsolved`, key: "unsolved", label: "期間内に解かれていない" },
  ]
  const summaryItems = [
    { label: "解いた人数", value: formatCount(passage.solvedUsers) },
    { label: "解いた回数", value: formatCount(passage.solvedAttempts) },
    { label: "正答率", value: isSolved ? formatRate(passage.correctRate) : "—" },
    { label: "平均時間 / 制限", value: isSolved ? formatElapsedWithLimit(passage.averageElapsedSeconds, passage.timeLimitSeconds) : "—" },
    { label: "時間超過", value: isSolved ? formatRate(passage.overtimeRate) : "—" },
    {
      label: "アシスト（和訳 / 単語 / 読み上げ）",
      value: isSolved
        ? `${formatRate(passage.assistRates.translated)} / ${formatRate(passage.assistRates.lookedUp)} / ${formatRate(passage.assistRates.listened)}`
        : "—",
    },
  ]

  return (
    <>
      <PageBreadcrumb pageTitle="問題の分析" />
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="text-theme-sm font-medium text-brand-500 hover:text-brand-600" href={`/mock/dashboard?period=${period}`}>
            ← ダッシュボードに戻る
          </Link>
          <PeriodTabs basePath={basePath} current={period} />
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={passage.status === "published" ? "success" : "light"} size="sm">
                  {passage.status === "published" ? PASSAGE_STATUS_LABELS.published : "非公開"}
                </Badge>
                <span className="text-theme-xs text-gray-400">{DIFFICULTY_LABELS[passage.difficulty]}</span>
              </div>
              <h2 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{passage.title}</h2>
              <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
                {passage.sourceName}・公開日 {passage.publishedAt ?? "—"}
              </p>
            </div>
            <Link className={outlineButtonClass} href="/mock/passages/42">確認・修正を開く</Link>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-gray-100 pt-5 sm:grid-cols-3 xl:grid-cols-6 dark:border-gray-800">
            {summaryItems.map(item => (
              <div key={item.label}>
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">{item.label}</dt>
                <dd className="mt-1 text-base font-semibold text-gray-800 tabular-nums dark:text-white/90">{item.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-theme-xs text-gray-400">{STATS_PERIOD_LABELS[period]}の数字（日本時間）</p>
        </section>

        <Alert
          message="非公開に戻して選択肢や正解を直した問題は、直す前の解答も同じ設問・同じ位置の選択肢として数えます。正誤は提出したときのものです。"
          title="直した問題の数え方"
          variant="info"
        />

        <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
          {MOCK_QUESTION_STATS.map(question => (
            <QuestionStatsCard key={question.id} isSolved={isSolved} question={question} solvedAttempts={passage.solvedAttempts} />
          ))}
        </div>
      </div>
      <MockStatePanel current={current} states={states} />
    </>
  )
}
