import Link from "next/link"

import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import Alert from "@/components/ui/alert/Alert"
import Badge from "@/components/ui/badge/Badge"
import {
  convertToStatsPeriod,
  DIFFICULTY_LABELS,
  MOCK_PASSAGE_STATS,
  MOCK_QUESTION_STATS,
  PASSAGE_STATUS_LABELS,
  STATS_PERIOD_LABELS,
} from "@/libs/mock-data"

import { MockStatePanel } from "../../../_components/MockStatePanel"
import { PeriodTabs } from "../../../_components/PeriodTabs"
import { EMPTY_VALUE, formatCount, formatElapsedWithLimit, formatRate } from "../../../_components/stats-format"
import { cardClass, outlineButtonClass } from "../../../_components/ui"

import { QuestionStatsCard, REVIEW_MIN_ATTEMPTS } from "./QuestionStatsCard"

/**
 * 「解いた回数が少ない」状態で出す解いた回数・人数（REVIEW_MIN_ATTEMPTS より少なく、要確認の印が付かない）。
 * 設問の数は挑戦があると変えられないので、どの設問の解答の数も解いた回数と同じ
 */
const FEW_STATE_SOLVED_ATTEMPTS = REVIEW_MIN_ATTEMPTS - 2

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
  const period = convertToStatsPeriod(rawPeriod)
  const current = state === "few" || state === "unsolved" || state === "not-found" ? state : "normal"
  const basePath = `/mock/analytics/passages/${id}`
  const passageRow = MOCK_PASSAGE_STATS[period].find(row => row.id === Number(id))

  const states = [
    { href: `${basePath}?period=${period}`, key: "normal", label: "通常（Q2・Q4 が要確認）" },
    { href: `${basePath}?period=${period}&state=few`, key: "few", label: `解いた回数が ${REVIEW_MIN_ATTEMPTS} 回未満（要確認を出さない）` },
    { href: `${basePath}?period=${period}&state=unsolved`, key: "unsolved", label: "期間内に解かれていない" },
    { href: `${basePath}?period=${period}&state=not-found`, key: "not-found", label: "問題が見つからない" },
  ]

  if (current === "not-found" || !passageRow) {
    return (
      <>
        <PageBreadcrumb pageTitle="問題の分析" />
        <div className={`${cardClass} px-6 py-16 text-center`}>
          <p className="text-base font-medium text-gray-800 dark:text-white/90">問題が見つかりません</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">ID が違います。本実装では 404 の画面になります。</p>
          <Link className="mt-4 inline-block text-sm font-medium text-brand-500 hover:text-brand-600" href={`/mock/dashboard?period=${period}`}>ダッシュボードに戻る</Link>
        </div>
        <MockStatePanel current="not-found" states={states} />
      </>
    )
  }

  const solvedAttempts = current === "unsolved" ? 0 : current === "few" ? FEW_STATE_SOLVED_ATTEMPTS : passageRow.solvedAttempts
  const isSolved = solvedAttempts > 0
  const passage = {
    ...passageRow,
    solvedAttempts,
    solvedUsers: current === "unsolved" ? 0 : current === "few" ? FEW_STATE_SOLVED_ATTEMPTS : passageRow.solvedUsers,
  }
  const summaryItems = [
    { label: "解いた人数", value: formatCount(passage.solvedUsers) },
    { label: "解いた回数", value: formatCount(passage.solvedAttempts) },
    { label: "正答率", value: isSolved ? formatRate(passage.correctRate) : EMPTY_VALUE },
    { label: "平均時間 / 制限", value: isSolved ? formatElapsedWithLimit(passage.averageElapsedSeconds, passage.timeLimitSeconds) : EMPTY_VALUE },
    { label: "時間超過", value: isSolved ? formatRate(passage.overtimeRate) : EMPTY_VALUE },
    {
      label: "アシスト（和訳 / 単語 / 読み上げ）",
      value: isSolved
        ? `${formatRate(passage.assistRates.translated)} / ${formatRate(passage.assistRates.lookedUp)} / ${formatRate(passage.assistRates.listened)}`
        : EMPTY_VALUE,
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
          <PeriodTabs basePath={basePath} current={period} extraQuery={current === "normal" ? undefined : `state=${current}`} />
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
                {passage.sourceName}・公開日 {passage.publishedAt ?? EMPTY_VALUE}
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
            <QuestionStatsCard key={question.id} isSolved={isSolved} answerCount={passage.solvedAttempts} question={question} />
          ))}
        </div>
      </div>
      <MockStatePanel current={current} states={states} />
    </>
  )
}
